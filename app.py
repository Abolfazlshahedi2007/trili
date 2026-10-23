import os
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory, render_template
from werkzeug.utils import secure_filename
from models import db, Setting, Trip, Expense, AdvancePayment, Settlement

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder='static', static_url_path='')
app.config['SECRET_KEY'] = 'trili-secret-key-1405'
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(BASE_DIR, 'trili.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16 MB

db.init_app(app)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ----------------- Database Init & Seed -----------------
def init_db():
    with app.app_context():
        db.create_all()
        # Seed default settings if empty
        if not Setting.query.first():
            default_setting = Setting(
                owner_name='پدر (مالک تریلی)',
                driver_name='راننده محترم',
                plate_number='۱۲ ع ۳۴۵ ایران ۲۱',
                truck_model='تریلی ولوو FH500',
                driver_share_percent=20.0
            )
            db.session.add(default_setting)
            
            # Add an initial realistic trip so user immediately sees how it works
            sample_trip = Trip(
                trip_number='101',
                bill_number='B-89241',
                origin='بندرعباس (اسکله رجایی)',
                destination='تهران (شورآباد)',
                cargo_type='کانتینر ۴۰ فوت',
                weight_tons=24.5,
                loading_date='1405/02/01',
                discharge_date='1405/02/03',
                total_freight=45000000, # ۴۵ میلیون
                commission_fee=3000000, # ۳ میلیون کمیسیون
                driver_share_percent=20.0,
                cash_received_by_driver=5000000, # ۵ میلیون نقد دست راننده
                notes='بارگیری و تخلیه به موقع انجام شد.'
            )
            sample_trip.calculate_shares() # صافی: ۴۲ میلیون -> سهم راننده: ۸.۴ میلیون
            db.session.add(sample_trip)
            db.session.flush()

            # Add sample expenses
            exp1 = Expense(
                trip_id=sample_trip.id,
                category='گازوئیل',
                amount=850000,
                paid_by='driver', # راننده از جیبش داده
                expense_date='1405/02/02',
                description='سوخت‌گیری پمپ‌بنزین سیرجان'
            )
            exp2 = Expense(
                trip_id=sample_trip.id,
                category='عوارض',
                amount=120000,
                paid_by='driver',
                expense_date='1405/02/02',
                description='عوارضی آزادراه بندر به سیرجان'
            )
            exp3 = Expense(
                trip_id=sample_trip.id,
                category='باسکول',
                amount=80000,
                paid_by='driver',
                expense_date='1405/02/01',
                description='باسکول مبدا'
            )
            db.session.add_all([exp1, exp2, exp3])

            # Add sample advance payment by owner
            adv = AdvancePayment(
                amount=2000000, # ۲ میلیون کارت به کارت
                payment_date='1405/02/01',
                payment_method='کارت به کارت',
                tracking_code='548102',
                description='مساعده ابتدای سفر بندرعباس'
            )
            db.session.add(adv)
            
            db.session.commit()

# ----------------- Routes -----------------

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# ----------------- Settings API -----------------
@app.route('/api/settings', methods=['GET'])
def get_settings():
    s = Setting.query.first()
    if not s:
        s = Setting()
        db.session.add(s)
        db.session.commit()
    return jsonify(s.to_dict())

@app.route('/api/settings', methods=['POST'])
def update_settings():
    s = Setting.query.first()
    if not s:
        s = Setting()
        db.session.add(s)
    data = request.json or {}
    s.owner_name = data.get('owner_name', s.owner_name)
    s.driver_name = data.get('driver_name', s.driver_name)
    s.plate_number = data.get('plate_number', s.plate_number)
    s.truck_model = data.get('truck_model', s.truck_model)
    s.driver_share_percent = float(data.get('driver_share_percent', s.driver_share_percent))
    db.session.commit()
    return jsonify({'status': 'success', 'settings': s.to_dict()})

# ----------------- Summary / Dashboard API -----------------
@app.route('/api/summary', methods=['GET'])
def get_summary():
    setting = Setting.query.first()
    driver_pct = setting.driver_share_percent if setting else 20.0

    # بارها و سفرهای تسویه نشده
    unsettled_trips = Trip.query.filter_by(is_settled=False).all()
    unsettled_expenses = Expense.query.filter_by(is_settled=False).all()
    unsettled_payments = AdvancePayment.query.filter_by(is_settled=False).all()

    # محاسبات درآمد بارها
    total_freight_unsettled = sum(t.total_freight or 0 for t in unsettled_trips)
    net_freight_unsettled = sum(t.net_freight or 0 for t in unsettled_trips)
    driver_share_unsettled = sum(t.driver_share_amount or 0 for t in unsettled_trips)
    owner_share_unsettled = sum(t.owner_share_amount or 0 for t in unsettled_trips)
    
    # پیش‌کرایه‌های نقدی دست راننده
    driver_cash_collected = sum(t.cash_received_by_driver or 0 for t in unsettled_trips)

    # خرج‌های پرداخت شده توسط راننده (طلب راننده از پدر)
    driver_paid_expenses = sum(e.amount for e in unsettled_expenses if e.paid_by == 'driver')
    
    # خرج‌های پرداخت شده توسط پدر
    owner_paid_expenses = sum(e.amount for e in unsettled_expenses if e.paid_by == 'owner')

    # مساعده‌ها و واریزی‌های پدر به راننده (بدهی راننده)
    advances_paid = sum(p.amount for p in unsettled_payments)

    # فرمول تسویه حساب شفاف:
    # ۱. طلب راننده: سهم ۲۰٪ از بارها + خرج‌هایی که از جیبش داده
    driver_total_credit = driver_share_unsettled + driver_paid_expenses
    
    # ۲. بدهی راننده: پیش‌کرایه‌های نقدی که دست راننده است + مساعده‌های واریزی پدر
    driver_total_debit = driver_cash_collected + advances_paid

    # ۳. مانده نهایی: مثبت = طلب راننده (پدر باید بدهد)، منفی = بدهی راننده (راننده باید به پدر بدهد)
    final_balance = driver_total_credit - driver_total_debit

    # آمار کلی همه زمان‌ها (جهت داشبورد کلی تریلی)
    all_trips = Trip.query.all()
    all_expenses = Expense.query.all()
    
    total_lifetime_freight = sum(t.net_freight or 0 for t in all_trips)
    total_lifetime_expenses = sum(e.amount for e in all_expenses)
    net_truck_profit = total_lifetime_freight - total_lifetime_expenses

    return jsonify({
        'driver_percent': driver_pct,
        'unsettled_trips_count': len(unsettled_trips),
        'total_freight_unsettled': total_freight_unsettled,
        'net_freight_unsettled': net_freight_unsettled,
        'driver_share_unsettled': driver_share_unsettled,
        'owner_share_unsettled': owner_share_unsettled,
        'driver_cash_collected': driver_cash_collected,
        'driver_paid_expenses': driver_paid_expenses,
        'owner_paid_expenses': owner_paid_expenses,
        'advances_paid': advances_paid,
        'driver_total_credit': driver_total_credit,
        'driver_total_debit': driver_total_debit,
        'final_balance': final_balance,
        'lifetime': {
            'total_trips': len(all_trips),
            'total_net_freight': total_lifetime_freight,
            'total_expenses': total_lifetime_expenses,
            'net_profit': net_truck_profit
        }
    })

# ----------------- Trips API -----------------
@app.route('/api/trips', methods=['GET'])
def get_trips():
    status_filter = request.args.get('status', 'all')
    query = Trip.query.order_by(Trip.id.desc())
    if status_filter == 'unsettled':
        query = query.filter_by(is_settled=False)
    elif status_filter == 'settled':
        query = query.filter_by(is_settled=True)
    trips = query.all()
    return jsonify([t.to_dict() for t in trips])

@app.route('/api/trips', methods=['POST'])
def add_trip():
    data = request.json or {}
    setting = Setting.query.first()
    default_pct = setting.driver_share_percent if setting else 20.0

    pct = float(data.get('driver_share_percent') or default_pct)
    trip = Trip(
        trip_number=data.get('trip_number'),
        bill_number=data.get('bill_number'),
        origin=data.get('origin', '').strip(),
        destination=data.get('destination', '').strip(),
        cargo_type=data.get('cargo_type'),
        weight_tons=float(data.get('weight_tons') or 0),
        loading_date=data.get('loading_date'),
        discharge_date=data.get('discharge_date'),
        total_freight=int(data.get('total_freight') or 0),
        commission_fee=int(data.get('commission_fee') or 0),
        driver_share_percent=pct,
        cash_received_by_driver=int(data.get('cash_received_by_driver') or 0),
        notes=data.get('notes')
    )
    trip.calculate_shares()
    db.session.add(trip)
    db.session.commit()
    return jsonify({'status': 'success', 'trip': trip.to_dict()})

@app.route('/api/trips/<int:trip_id>', methods=['PUT'])
def update_trip(trip_id):
    trip = Trip.query.get_or_404(trip_id)
    data = request.json or {}
    trip.trip_number = data.get('trip_number', trip.trip_number)
    trip.bill_number = data.get('bill_number', trip.bill_number)
    trip.origin = data.get('origin', trip.origin)
    trip.destination = data.get('destination', trip.destination)
    trip.cargo_type = data.get('cargo_type', trip.cargo_type)
    trip.weight_tons = float(data.get('weight_tons', trip.weight_tons or 0))
    trip.loading_date = data.get('loading_date', trip.loading_date)
    trip.discharge_date = data.get('discharge_date', trip.discharge_date)
    trip.total_freight = int(data.get('total_freight', trip.total_freight or 0))
    trip.commission_fee = int(data.get('commission_fee', trip.commission_fee or 0))
    if 'driver_share_percent' in data:
        trip.driver_share_percent = float(data['driver_share_percent'])
    trip.cash_received_by_driver = int(data.get('cash_received_by_driver', trip.cash_received_by_driver or 0))
    trip.notes = data.get('notes', trip.notes)
    trip.calculate_shares()
    db.session.commit()
    return jsonify({'status': 'success', 'trip': trip.to_dict()})

@app.route('/api/trips/<int:trip_id>', methods=['DELETE'])
def delete_trip(trip_id):
    trip = Trip.query.get_or_404(trip_id)
    # Detach or delete associated expenses
    for exp in trip.expenses:
        exp.trip_id = None
    db.session.delete(trip)
    db.session.commit()
    return jsonify({'status': 'success'})

# ----------------- Expenses API -----------------
@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    status_filter = request.args.get('status', 'all')
    paid_by_filter = request.args.get('paid_by', 'all')
    query = Expense.query.order_by(Expense.id.desc())
    if status_filter == 'unsettled':
        query = query.filter_by(is_settled=False)
    elif status_filter == 'settled':
        query = query.filter_by(is_settled=True)
    if paid_by_filter in ['driver', 'owner']:
        query = query.filter_by(paid_by=paid_by_filter)
    expenses = query.all()
    return jsonify([e.to_dict() for e in expenses])

@app.route('/api/expenses', methods=['POST'])
def add_expense():
    data = request.json or {}
    trip_id = data.get('trip_id')
    if trip_id == '' or trip_id == 'none':
        trip_id = None
    elif trip_id is not None:
        trip_id = int(trip_id)

    exp = Expense(
        trip_id=trip_id,
        category=data.get('category', 'متفرقه'),
        amount=int(data.get('amount') or 0),
        paid_by=data.get('paid_by', 'driver'),
        expense_date=data.get('expense_date'),
        description=data.get('description'),
        receipt_image=data.get('receipt_image')
    )
    db.session.add(exp)
    db.session.commit()
    return jsonify({'status': 'success', 'expense': exp.to_dict()})

@app.route('/api/expenses/<int:exp_id>', methods=['DELETE'])
def delete_expense(exp_id):
    exp = Expense.query.get_or_404(exp_id)
    db.session.delete(exp)
    db.session.commit()
    return jsonify({'status': 'success'})

# ----------------- Advance Payments API -----------------
@app.route('/api/payments', methods=['GET'])
def get_payments():
    status_filter = request.args.get('status', 'all')
    query = AdvancePayment.query.order_by(AdvancePayment.id.desc())
    if status_filter == 'unsettled':
        query = query.filter_by(is_settled=False)
    elif status_filter == 'settled':
        query = query.filter_by(is_settled=True)
    payments = query.all()
    return jsonify([p.to_dict() for p in payments])

@app.route('/api/payments', methods=['POST'])
def add_payment():
    data = request.json or {}
    pay = AdvancePayment(
        amount=int(data.get('amount') or 0),
        payment_date=data.get('payment_date'),
        payment_method=data.get('payment_method', 'کارت به کارت'),
        tracking_code=data.get('tracking_code'),
        description=data.get('description'),
        receipt_image=data.get('receipt_image')
    )
    db.session.add(pay)
    db.session.commit()
    return jsonify({'status': 'success', 'payment': pay.to_dict()})

@app.route('/api/payments/<int:pay_id>', methods=['DELETE'])
def delete_payment(pay_id):
    pay = AdvancePayment.query.get_or_404(pay_id)
    db.session.delete(pay)
    db.session.commit()
    return jsonify({'status': 'success'})

# ----------------- Settlements API -----------------
@app.route('/api/settlements', methods=['GET'])
def get_settlements():
    settlements = Settlement.query.order_by(Settlement.id.desc()).all()
    return jsonify([s.to_dict() for s in settlements])

@app.route('/api/settlements', methods=['POST'])
def create_settlement():
    data = request.json or {}
    title = data.get('title') or f"تسویه حساب مورخ {data.get('settlement_date', 'امروز')}"
    settlement_date = data.get('settlement_date') or datetime.now().strftime('%Y/%m/%d')
    
    # Find all currently unsettled items
    unsettled_trips = Trip.query.filter_by(is_settled=False).all()
    unsettled_expenses = Expense.query.filter_by(is_settled=False).all()
    unsettled_payments = AdvancePayment.query.filter_by(is_settled=False).all()

    if not unsettled_trips and not unsettled_expenses and not unsettled_payments:
        return jsonify({'status': 'error', 'message': 'هیچ موردی برای تسویه حساب وجود ندارد.'}), 400

    total_net_freight = sum(t.net_freight or 0 for t in unsettled_trips)
    driver_earned_share = sum(t.driver_share_amount or 0 for t in unsettled_trips)
    driver_paid_expenses = sum(e.amount for e in unsettled_expenses if e.paid_by == 'driver')
    driver_cash_collected = sum(t.cash_received_by_driver or 0 for t in unsettled_trips)
    advances_paid_by_owner = sum(p.amount for p in unsettled_payments)

    total_driver_credit = driver_earned_share + driver_paid_expenses
    total_driver_debit = driver_cash_collected + advances_paid_by_owner
    final_balance = total_driver_credit - total_driver_debit

    settlement = Settlement(
        title=title,
        settlement_date=settlement_date,
        total_trips_count=len(unsettled_trips),
        total_net_freight=total_net_freight,
        driver_earned_share=driver_earned_share,
        driver_paid_expenses=driver_paid_expenses,
        total_driver_credit=total_driver_credit,
        driver_cash_collected=driver_cash_collected,
        advances_paid_by_owner=advances_paid_by_owner,
        total_driver_debit=total_driver_debit,
        final_balance=final_balance,
        status='تسویه شده',
        notes=data.get('notes')
    )
    db.session.add(settlement)
    db.session.flush()

    # Mark all items as settled
    for t in unsettled_trips:
        t.is_settled = True
        t.settlement_id = settlement.id
    for e in unsettled_expenses:
        e.is_settled = True
        e.settlement_id = settlement.id
    for p in unsettled_payments:
        p.is_settled = True
        p.settlement_id = settlement.id

    db.session.commit()
    return jsonify({'status': 'success', 'settlement': settlement.to_dict()})

@app.route('/api/settlements/<int:settlement_id>', methods=['GET'])
def get_settlement_detail(settlement_id):
    settlement = Settlement.query.get_or_404(settlement_id)
    trips = [t.to_dict() for t in settlement.trips]
    expenses = [e.to_dict() for e in settlement.expenses]
    payments = [p.to_dict() for p in settlement.payments]
    res = settlement.to_dict()
    res['trips'] = trips
    res['expenses'] = expenses
    res['payments'] = payments
    return jsonify(res)

# ----------------- File Upload -----------------
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'فایلی انتخاب نشده است'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'فایلی انتخاب نشده است'}), 400
    if file and allowed_file(file.filename):
        ext = file.filename.rsplit('.', 1)[1].lower()
        unique_name = f"{uuid.uuid4().hex[:12]}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        return jsonify({'status': 'success', 'filename': unique_name, 'url': f"/uploads/{unique_name}"})
    return jsonify({'status': 'error', 'message': 'فرمت فایل مجاز نیست'}), 400

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f"Server is running on http://127.0.0.1:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
