import os
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
from sqlalchemy.orm import joinedload
from models import db, Setting, Trip, Expense, AdvancePayment, Settlement, AuditLog

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app = Flask(__name__, static_folder='static', static_url_path='')
app.config['SECRET_KEY'] = 'trili-secure-fleet-key-1405'
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(BASE_DIR, 'trili.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16 MB

db.init_app(app)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ----------------- QA & Data Sanitization Helpers -----------------
def normalize_digits(value):
    """Convert Persian and Arabic numerals to standard English digits."""
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    persian_digits = '۰۱۲۳۴۵۶۷۸۹'
    arabic_digits = '٠١٢٣٤٥٦٧٨٩'
    for i in range(10):
        value = value.replace(persian_digits[i], str(i)).replace(arabic_digits[i], str(i))
    return value.strip()

def parse_int_safe(value, default=0, allow_negative=False):
    """Safely parse integer from raw string, preventing negative values and float inaccuracies."""
    if value is None:
        return default
    s = normalize_digits(value).replace(',', '').replace('،', '')
    try:
        val = int(round(float(s)))
        return val if allow_negative else max(0, val)
    except (ValueError, TypeError):
        return default

def parse_float_safe(value, default=0.0):
    if value is None:
        return default
    s = normalize_digits(value).replace(',', '').replace('،', '')
    try:
        val = float(s)
        return max(0.0, val)
    except (ValueError, TypeError):
        return default

# ----------------- Audit Trail Logging -----------------
def record_audit(action, entity_type, entity_id, actor_role, details):
    try:
        audit = AuditLog(
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            actor_role=actor_role,
            details=details
        )
        db.session.add(audit)
    except Exception as e:
        print(f"Audit log error: {e}")

# ----------------- Database Init & Auto-Migration -----------------
def init_db():
    with app.app_context():
        db.create_all()
        # Safe column migration for SQLite
        try:
            with db.engine.connect() as conn:
                existing_cols = [row[1] for row in conn.execute(db.text("PRAGMA table_info(settings)")).fetchall()]
                if 'owner_pin' not in existing_cols:
                    conn.execute(db.text("ALTER TABLE settings ADD COLUMN owner_pin VARCHAR(50) DEFAULT '1234'"))
                if 'driver_share_basis' not in existing_cols:
                    conn.execute(db.text("ALTER TABLE settings ADD COLUMN driver_share_basis VARCHAR(20) DEFAULT 'net'"))
                
                exp_cols = [row[1] for row in conn.execute(db.text("PRAGMA table_info(expenses)")).fetchall()]
                if 'liability' not in exp_cols:
                    conn.execute(db.text("ALTER TABLE expenses ADD COLUMN liability VARCHAR(30) DEFAULT 'owner_machine'"))

                pay_cols = [row[1] for row in conn.execute(db.text("PRAGMA table_info(advance_payments)")).fetchall()]
                if 'payer' not in pay_cols:
                    conn.execute(db.text("ALTER TABLE advance_payments ADD COLUMN payer VARCHAR(20) DEFAULT 'owner'"))

                set_cols = [row[1] for row in conn.execute(db.text("PRAGMA table_info(settlements)")).fetchall()]
                if 'driver_transfers_to_owner' not in set_cols:
                    conn.execute(db.text("ALTER TABLE settlements ADD COLUMN driver_transfers_to_owner BIGINT DEFAULT 0"))

                conn.commit()
        except Exception as e:
            print(f"Migration notice: {e}")

        # Seed default settings if empty
        if not Setting.query.first():
            default_setting = Setting(
                owner_name='پدر (مالک تریلی)',
                driver_name='راننده محترم',
                plate_number='۱۲ ع ۳۴۵ ایران ۲۱',
                truck_model='تریلی ولوو FH500',
                driver_share_percent=20.0,
                driver_share_basis='net',
                owner_pin='1234'
            )
            db.session.add(default_setting)
            
            sample_trip = Trip(
                trip_number='101',
                bill_number='B-89241',
                origin='بندرعباس (اسکله رجایی)',
                destination='تهران (شورآباد)',
                cargo_type='کانتینر ۴۰ فوت',
                weight_tons=24.5,
                loading_date='1405/02/01',
                discharge_date='1405/02/03',
                total_freight=45000000,
                commission_fee=3000000,
                driver_share_percent=20.0,
                cash_received_by_driver=5000000,
                notes='بارگیری و تخلیه به موقع انجام شد.'
            )
            sample_trip.calculate_shares(basis='net')
            db.session.add(sample_trip)
            db.session.flush()

            exp1 = Expense(
                trip_id=sample_trip.id,
                category='گازوئیل',
                amount=850000,
                paid_by='driver',
                liability='owner_machine',
                expense_date='1405/02/02',
                description='سوخت‌گیری سیرجان'
            )
            exp2 = Expense(
                trip_id=sample_trip.id,
                category='عوارض',
                amount=120000,
                paid_by='driver',
                liability='owner_machine',
                expense_date='1405/02/02',
                description='عوارضی آزادراه بندر به سیرجان'
            )
            db.session.add_all([exp1, exp2])

            adv = AdvancePayment(
                amount=2000000,
                payment_date='1405/02/01',
                payment_method='کارت به کارت',
                tracking_code='548102',
                description='مساعده ابتدای سفر بندرعباس'
            )
            db.session.add(adv)
            
            db.session.commit()
            record_audit('CREATE', 'Setting', default_setting.id, 'system', 'مقادیر اولیه سیستم با موفقیت ثبت شد.')

# ----------------- Static & Web Routes -----------------
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], secure_filename(filename))

# ----------------- Auth & Settings API -----------------
@app.route('/api/auth/verify-owner-pin', methods=['POST'])
def verify_owner_pin():
    data = request.json or {}
    pin = normalize_digits(data.get('pin', ''))
    s = Setting.query.first()
    correct_pin = normalize_digits(s.owner_pin if s and s.owner_pin else '1234')
    if pin == correct_pin:
        record_audit('LOGIN', 'Auth', s.id if s else 0, 'owner', 'ورود موفق به پنل مدیریت مالک')
        return jsonify({'status': 'success', 'message': 'رمز عبور صحیح است'})
    
    record_audit('LOGIN_FAILED', 'Auth', s.id if s else 0, 'driver', 'تلاش ناموفق برای ورود به پنل مالک با رمز اشتباه')
    return jsonify({'status': 'error', 'message': 'رمز عبور پنل مالک نادرست است'}), 401

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
    actor_role = request.headers.get('X-Role', 'owner')
    s = Setting.query.first()
    if not s:
        s = Setting()
        db.session.add(s)
    data = request.json or {}
    
    s.owner_name = data.get('owner_name', s.owner_name).strip()
    s.driver_name = data.get('driver_name', s.driver_name).strip()
    s.plate_number = normalize_digits(data.get('plate_number', s.plate_number)).strip()
    s.truck_model = data.get('truck_model', s.truck_model).strip()
    s.driver_share_percent = parse_float_safe(data.get('driver_share_percent'), s.driver_share_percent)
    s.driver_share_basis = data.get('driver_share_basis', s.driver_share_basis)
    
    new_pin = normalize_digits(data.get('owner_pin', '')).strip()
    if new_pin:
        s.owner_pin = new_pin
        
    db.session.commit()
    record_audit('UPDATE', 'Setting', s.id, actor_role, f"تنظیمات قرارداد و خودرو به‌روزرسانی شد. درصد: {s.driver_share_percent}٪")
    return jsonify({'status': 'success', 'settings': s.to_dict()})

# ----------------- Summary / Dashboard API -----------------
@app.route('/api/summary', methods=['GET'])
def get_summary():
    setting = Setting.query.first()
    driver_pct = setting.driver_share_percent if setting else 20.0
    role = request.args.get('role', 'driver')

    # Unsettled records query with index efficiency
    unsettled_trips = Trip.query.filter_by(is_settled=False).all()
    unsettled_expenses = Expense.query.filter_by(is_settled=False).all()
    unsettled_payments = AdvancePayment.query.filter_by(is_settled=False).all()

    total_freight_unsettled = sum(t.total_freight or 0 for t in unsettled_trips)
    net_freight_unsettled = sum(t.net_freight or 0 for t in unsettled_trips)
    driver_share_unsettled = sum(t.driver_share_amount or 0 for t in unsettled_trips)
    owner_share_unsettled = sum(t.owner_share_amount or 0 for t in unsettled_trips)
    driver_cash_collected = sum(t.cash_received_by_driver or 0 for t in unsettled_trips)

    # Driver expenses (Owner liability paid by driver from pocket -> Credited to Driver)
    driver_paid_expenses = sum(e.amount for e in unsettled_expenses if e.paid_by == 'driver')
    owner_paid_expenses = sum(e.amount for e in unsettled_expenses if e.paid_by == 'owner')
    
    # Two-way payments:
    # 1. Driver transfers to Owner (واریزی راننده به حساب صاحب ماشین -> بستانکاری راننده)
    driver_transfers_to_owner = sum(p.amount for p in unsettled_payments if getattr(p, 'payer', 'owner') == 'driver')
    # 2. Advances paid by Owner to Driver (مساعده مالک به راننده -> بدهکاری راننده)
    advances_paid_by_owner = sum(p.amount for p in unsettled_payments if getattr(p, 'payer', 'owner') != 'driver')

    # Strict Accounting Formula:
    # Driver Credit (طلب راننده) = Earned Share + Road Expenses Paid by Driver + Money transferred to Owner
    driver_total_credit = driver_share_unsettled + driver_paid_expenses + driver_transfers_to_owner
    # Driver Debit (بدهی راننده) = Cash collected by Driver on waybills + Advances paid by Owner
    driver_total_debit = driver_cash_collected + advances_paid_by_owner
    # Final Balance (+ Owner owes driver, - Driver owes owner)
    final_balance = driver_total_credit - driver_total_debit

    # Data Masking for Driver Role (Strict Security & Privacy)
    if role == 'driver':
        return jsonify({
            'role': 'driver',
            'driver_percent': driver_pct,
            'unsettled_trips_count': len(unsettled_trips),
            'driver_share_unsettled': driver_share_unsettled,
            'driver_cash_collected': driver_cash_collected,
            'driver_paid_expenses': driver_paid_expenses,
            'driver_transfers_to_owner': driver_transfers_to_owner,
            'advances_paid': advances_paid_by_owner,
            'driver_total_credit': driver_total_credit,
            'driver_total_debit': driver_total_debit,
            'final_balance': final_balance
        })

    # Owner Full Analytics
    all_trips = Trip.query.all()
    all_expenses = Expense.query.all()
    total_lifetime_freight = sum(t.net_freight or 0 for t in all_trips)
    total_lifetime_expenses = sum(e.amount for e in all_expenses)
    net_truck_profit = total_lifetime_freight - total_lifetime_expenses

    return jsonify({
        'role': 'owner',
        'driver_percent': driver_pct,
        'unsettled_trips_count': len(unsettled_trips),
        'total_freight_unsettled': total_freight_unsettled,
        'net_freight_unsettled': net_freight_unsettled,
        'driver_share_unsettled': driver_share_unsettled,
        'owner_share_unsettled': owner_share_unsettled,
        'driver_cash_collected': driver_cash_collected,
        'driver_paid_expenses': driver_paid_expenses,
        'owner_paid_expenses': owner_paid_expenses,
        'driver_transfers_to_owner': driver_transfers_to_owner,
        'advances_paid': advances_paid_by_owner,
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
    query = Trip.query.options(joinedload(Trip.expenses)).order_by(Trip.id.desc())
    if status_filter == 'unsettled':
        query = query.filter_by(is_settled=False)
    elif status_filter == 'settled':
        query = query.filter_by(is_settled=True)
    trips = query.all()
    return jsonify([t.to_dict() for t in trips])

@app.route('/api/trips', methods=['POST'])
def add_trip():
    data = request.json or {}
    actor_role = request.headers.get('X-Role', 'driver')
    setting = Setting.query.first()
    default_pct = setting.driver_share_percent if setting else 20.0
    basis = setting.driver_share_basis if setting else 'net'

    pct = parse_float_safe(data.get('driver_share_percent'), default_pct)
    trip = Trip(
        trip_number=normalize_digits(data.get('trip_number')),
        bill_number=normalize_digits(data.get('bill_number')),
        origin=data.get('origin', '').strip(),
        destination=data.get('destination', '').strip(),
        cargo_type=data.get('cargo_type', '').strip(),
        weight_tons=parse_float_safe(data.get('weight_tons')),
        loading_date=normalize_digits(data.get('loading_date')),
        discharge_date=normalize_digits(data.get('discharge_date')),
        total_freight=parse_int_safe(data.get('total_freight')),
        commission_fee=parse_int_safe(data.get('commission_fee')),
        driver_share_percent=pct,
        cash_received_by_driver=parse_int_safe(data.get('cash_received_by_driver')),
        notes=data.get('notes', '').strip()
    )
    trip.calculate_shares(basis=basis)
    db.session.add(trip)
    db.session.commit()
    
    record_audit('CREATE', 'Trip', trip.id, actor_role, f"ثبت بارنامه {trip.bill_number}: {trip.origin} به {trip.destination} (کرایه: {trip.total_freight:,} تومان)")
    return jsonify({'status': 'success', 'trip': trip.to_dict()})

@app.route('/api/trips/<int:trip_id>', methods=['DELETE'])
def delete_trip(trip_id):
    actor_role = request.headers.get('X-Role', 'driver')
    if actor_role != 'owner':
        return jsonify({'status': 'error', 'message': 'فقط مالک مجاز به حذف بارنامه است.'}), 403

    trip = Trip.query.get_or_404(trip_id)
    if trip.is_settled:
        return jsonify({'status': 'error', 'message': 'بارنامه‌های تسویه شده قابل حذف نیستند.'}), 400

    info = f"حذف بارنامه {trip.bill_number}: {trip.origin} به {trip.destination}"
    for exp in trip.expenses:
        exp.trip_id = None
    db.session.delete(trip)
    db.session.commit()
    
    record_audit('DELETE', 'Trip', trip_id, actor_role, info)
    return jsonify({'status': 'success'})

# ----------------- Expenses API -----------------
@app.route('/api/expenses', methods=['GET'])
def get_expenses():
    role = request.args.get('role', 'driver')
    status_filter = request.args.get('status', 'all')
    paid_by_filter = request.args.get('paid_by', 'all')
    query = Expense.query.order_by(Expense.id.desc())
    
    # Driver only sees their out-of-pocket expenses
    if role == 'driver':
        query = query.filter_by(paid_by='driver')
    elif paid_by_filter in ['driver', 'owner']:
        query = query.filter_by(paid_by=paid_by_filter)
        
    if status_filter == 'unsettled':
        query = query.filter_by(is_settled=False)
    elif status_filter == 'settled':
        query = query.filter_by(is_settled=True)
    expenses = query.all()
    return jsonify([e.to_dict() for e in expenses])

@app.route('/api/expenses', methods=['POST'])
def add_expense():
    data = request.json or {}
    actor_role = request.headers.get('X-Role', 'driver')
    
    trip_id = data.get('trip_id')
    if trip_id in ['', 'none', None]:
        trip_id = None
    else:
        trip_id = parse_int_safe(trip_id)

    paid_by = 'driver' if actor_role == 'driver' else data.get('paid_by', 'driver')
    exp = Expense(
        trip_id=trip_id,
        category=data.get('category', 'متفرقه').strip(),
        amount=parse_int_safe(data.get('amount')),
        paid_by=paid_by,
        liability=data.get('liability', 'owner_machine'),
        expense_date=normalize_digits(data.get('expense_date')),
        description=data.get('description', '').strip(),
        receipt_image=data.get('receipt_image')
    )
    db.session.add(exp)
    db.session.commit()
    
    record_audit('CREATE', 'Expense', exp.id, actor_role, f"ثبت هزینه {exp.category} به مبلغ {exp.amount:,} تومان (پرداخت: {exp.paid_by})")
    return jsonify({'status': 'success', 'expense': exp.to_dict()})

@app.route('/api/expenses/<int:exp_id>', methods=['DELETE'])
def delete_expense(exp_id):
    actor_role = request.headers.get('X-Role', 'driver')
    if actor_role != 'owner':
        return jsonify({'status': 'error', 'message': 'فقط مالک مجاز به حذف هزینه است.'}), 403

    exp = Expense.query.get_or_404(exp_id)
    if exp.is_settled:
        return jsonify({'status': 'error', 'message': 'هزینه‌های تسویه شده قابل حذف نیستند.'}), 400

    info = f"حذف هزینه {exp.category} به مبلغ {exp.amount:,} تومان"
    db.session.delete(exp)
    db.session.commit()
    
    record_audit('DELETE', 'Expense', exp_id, actor_role, info)
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
    actor_role = request.headers.get('X-Role', 'driver')
    data = request.json or {}
    
    # Determine who paid:
    # If submitted by driver, payer is ALWAYS 'driver' (واریز راننده به حساب مالک)
    # If submitted by owner, owner can choose 'owner' (مساعده مالک به راننده) or 'driver' (واریزی راننده به کارت مالک)
    if actor_role == 'driver':
        payer = 'driver'
    else:
        payer = data.get('payer', 'owner')

    pay = AdvancePayment(
        payer=payer,
        amount=parse_int_safe(data.get('amount')),
        payment_date=normalize_digits(data.get('payment_date')),
        payment_method=data.get('payment_method', 'کارت به کارت'),
        tracking_code=normalize_digits(data.get('tracking_code')),
        description=data.get('description', '').strip(),
        receipt_image=data.get('receipt_image')
    )
    db.session.add(pay)
    db.session.commit()
    
    if pay.payer == 'driver':
        log_desc = f"ثبت واریزی راننده به کارت مالک به مبلغ {pay.amount:,} تومان"
    else:
        log_desc = f"ثبت مساعده مالک به راننده به مبلغ {pay.amount:,} تومان"
        
    record_audit('CREATE', 'AdvancePayment', pay.id, actor_role, log_desc)
    return jsonify({'status': 'success', 'payment': pay.to_dict()})

@app.route('/api/payments/<int:pay_id>', methods=['DELETE'])
def delete_payment(pay_id):
    actor_role = request.headers.get('X-Role', 'driver')
    if actor_role != 'owner':
        return jsonify({'status': 'error', 'message': 'فقط مالک مجاز به حذف واریزی است.'}), 403

    pay = AdvancePayment.query.get_or_404(pay_id)
    if pay.is_settled:
        return jsonify({'status': 'error', 'message': 'مساعده‌ها و واریزی‌های تسویه شده قابل حذف نیستند.'}), 400

    info = f"حذف واریزی به مبلغ {pay.amount:,} تومان"
    db.session.delete(pay)
    db.session.commit()
    
    record_audit('DELETE', 'AdvancePayment', pay_id, actor_role, info)
    return jsonify({'status': 'success'})

# ----------------- Settlements API -----------------
@app.route('/api/settlements', methods=['GET'])
def get_settlements():
    settlements = Settlement.query.order_by(Settlement.id.desc()).all()
    return jsonify([s.to_dict() for s in settlements])

@app.route('/api/settlements', methods=['POST'])
def create_settlement():
    actor_role = request.headers.get('X-Role', 'driver')
    if actor_role != 'owner':
        return jsonify({'status': 'error', 'message': 'فقط مالک مجاز به بستن و صدور قطعی تسویه حساب است.'}), 403

    data = request.json or {}
    settlement_date = normalize_digits(data.get('settlement_date')) or datetime.now().strftime('%Y/%m/%d')
    title = data.get('title') or f"تسویه حساب کارکرد مورخ {settlement_date}"
    
    unsettled_trips = Trip.query.filter_by(is_settled=False).all()
    unsettled_expenses = Expense.query.filter_by(is_settled=False).all()
    unsettled_payments = AdvancePayment.query.filter_by(is_settled=False).all()

    if not unsettled_trips and not unsettled_expenses and not unsettled_payments:
        return jsonify({'status': 'error', 'message': 'هیچ رکوردی برای تسویه حساب وجود ندارد.'}), 400

    total_net_freight = sum(t.net_freight or 0 for t in unsettled_trips)
    driver_earned_share = sum(t.driver_share_amount or 0 for t in unsettled_trips)
    driver_paid_expenses = sum(e.amount for e in unsettled_expenses if e.paid_by == 'driver')
    driver_cash_collected = sum(t.cash_received_by_driver or 0 for t in unsettled_trips)
    
    # Separate driver transfers to owner from owner advances to driver
    driver_transfers_to_owner = sum(p.amount for p in unsettled_payments if getattr(p, 'payer', 'owner') == 'driver')
    advances_paid_by_owner = sum(p.amount for p in unsettled_payments if getattr(p, 'payer', 'owner') != 'driver')

    total_driver_credit = driver_earned_share + driver_paid_expenses + driver_transfers_to_owner
    total_driver_debit = driver_cash_collected + advances_paid_by_owner
    final_balance = total_driver_credit - total_driver_debit

    settlement = Settlement(
        title=title,
        settlement_date=settlement_date,
        total_trips_count=len(unsettled_trips),
        total_net_freight=total_net_freight,
        driver_earned_share=driver_earned_share,
        driver_paid_expenses=driver_paid_expenses,
        driver_transfers_to_owner=driver_transfers_to_owner,
        total_driver_credit=total_driver_credit,
        driver_cash_collected=driver_cash_collected,
        advances_paid_by_owner=advances_paid_by_owner,
        total_driver_debit=total_driver_debit,
        final_balance=final_balance,
        status='تسویه شده',
        notes=data.get('notes', '').strip()
    )
    db.session.add(settlement)
    db.session.flush()

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
    record_audit('SETTLE', 'Settlement', settlement.id, actor_role, f"بستن قطعی حساب دوره. مانده نهایی: {final_balance:,} تومان")
    return jsonify({'status': 'success', 'settlement': settlement.to_dict()})

@app.route('/api/audit-logs', methods=['GET'])
def get_audit_logs():
    role = request.args.get('role', 'driver')
    if role != 'owner':
        return jsonify({'status': 'error', 'message': 'فقط مالک به تاریخچه تغییرات دسترسی دارد.'}), 403
    logs = AuditLog.query.order_by(AuditLog.id.desc()).limit(100).all()
    return jsonify([l.to_dict() for l in logs])

# ----------------- Secure File Upload -----------------
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'فایلی انتخاب نشده است'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'نام فایل نامعتبر است'}), 400
    if file and allowed_file(file.filename):
        ext = file.filename.rsplit('.', 1)[1].lower()
        unique_name = f"{uuid.uuid4().hex[:12]}.{ext}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        file.save(filepath)
        return jsonify({'status': 'success', 'filename': unique_name, 'url': f"/uploads/{unique_name}"})
    return jsonify({'status': 'error', 'message': 'فرمت فایل مجاز نیست (فقط تصاویر)'}), 400

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f"Fleet Accounting Server is running on port {port}")
    app.run(host='0.0.0.0', port=port, debug=False)
