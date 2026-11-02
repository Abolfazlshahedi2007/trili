from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Setting(db.Model):
    __tablename__ = 'settings'
    
    id = db.Column(db.Integer, primary_key=True)
    owner_name = db.Column(db.String(100), default='مالک تریلی')
    driver_name = db.Column(db.String(100), default='راننده محترم')
    plate_number = db.Column(db.String(50), default='۱۲ ع ۳۴۵ ایران ۲۱')
    truck_model = db.Column(db.String(100), default='تریلی کمپرسی / کفی')
    driver_share_percent = db.Column(db.Float, default=20.0)
    driver_share_basis = db.Column(db.String(20), default='net') # 'net' (صافی پس از کمیسیون) یا 'gross' (کل کرایه)
    owner_pin = db.Column(db.String(200), default='1234')

    def to_dict(self, include_pin=False):
        d = {
            'id': self.id,
            'owner_name': self.owner_name,
            'driver_name': self.driver_name,
            'plate_number': self.plate_number,
            'truck_model': self.truck_model,
            'driver_share_percent': self.driver_share_percent,
            'driver_share_basis': self.driver_share_basis
        }
        if include_pin:
            d['owner_pin'] = self.owner_pin
        return d


class Trip(db.Model):
    __tablename__ = 'trips'
    
    id = db.Column(db.Integer, primary_key=True)
    trip_number = db.Column(db.String(50), nullable=True)
    bill_number = db.Column(db.String(100), nullable=True) # شماره بارنامه
    origin = db.Column(db.String(100), nullable=False) # مبدا
    destination = db.Column(db.String(100), nullable=False) # مقصد
    cargo_type = db.Column(db.String(100), nullable=True) # نوع بار
    weight_tons = db.Column(db.Float, default=0.0) # تناژ
    loading_date = db.Column(db.String(20), nullable=True) # تاریخ بارگیری شمسی
    discharge_date = db.Column(db.String(20), nullable=True) # تاریخ تخلیه شمسی
    
    total_freight = db.Column(db.BigInteger, default=0, nullable=False) # کل کرایه ناخالص (تومان)
    commission_fee = db.Column(db.BigInteger, default=0, nullable=False) # کمیسیون باربری (تومان)
    net_freight = db.Column(db.BigInteger, default=0, nullable=False) # صافی کرایه (تومان)
    
    driver_share_percent = db.Column(db.Float, default=20.0, nullable=False)
    driver_share_amount = db.Column(db.BigInteger, default=0, nullable=False) # سهم راننده (تومان)
    owner_share_amount = db.Column(db.BigInteger, default=0, nullable=False) # سهم مالک (تومان)
    
    cash_received_by_driver = db.Column(db.BigInteger, default=0, nullable=False) # پیش‌کرایه/پس‌کرایه نقدی دست راننده
    
    is_settled = db.Column(db.Boolean, default=False, index=True)
    settlement_id = db.Column(db.Integer, db.ForeignKey('settlements.id'), nullable=True, index=True)
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    expenses = db.relationship('Expense', backref='trip', lazy=True)

    def calculate_shares(self, basis='net'):
        # صافی کرایه = کل کرایه منهای کمیسیون
        self.total_freight = max(0, int(self.total_freight or 0))
        self.commission_fee = max(0, int(self.commission_fee or 0))
        self.net_freight = max(0, self.total_freight - self.commission_fee)
        
        pct = (float(self.driver_share_percent) if self.driver_share_percent is not None else 20.0) / 100.0
        base_amount = self.total_freight if basis == 'gross' else self.net_freight
        self.driver_share_amount = int(round(base_amount * pct))
        self.owner_share_amount = max(0, self.net_freight - self.driver_share_amount)

    def to_dict(self):
        return {
            'id': self.id,
            'trip_number': self.trip_number,
            'bill_number': self.bill_number,
            'origin': self.origin,
            'destination': self.destination,
            'cargo_type': self.cargo_type,
            'weight_tons': self.weight_tons,
            'loading_date': self.loading_date,
            'discharge_date': self.discharge_date,
            'total_freight': self.total_freight,
            'commission_fee': self.commission_fee,
            'net_freight': self.net_freight,
            'driver_share_percent': self.driver_share_percent,
            'driver_share_amount': self.driver_share_amount,
            'owner_share_amount': self.owner_share_amount,
            'cash_received_by_driver': self.cash_received_by_driver,
            'is_settled': self.is_settled,
            'settlement_id': self.settlement_id,
            'notes': self.notes,
            'expenses_count': len(self.expenses) if self.expenses else 0,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else None
        }


class Expense(db.Model):
    __tablename__ = 'expenses'
    
    id = db.Column(db.Integer, primary_key=True)
    trip_id = db.Column(db.Integer, db.ForeignKey('trips.id'), nullable=True, index=True)
    category = db.Column(db.String(50), nullable=False) # گازوئیل، عوارض، باسکول، انعام، پنچری، روغن، تعمیرات، متفرقه
    amount = db.Column(db.BigInteger, nullable=False, default=0) # تومان
    paid_by = db.Column(db.String(20), default='driver', index=True) # 'driver' (از جیب راننده) یا 'owner' (از جیب مالک)
    liability = db.Column(db.String(30), default='owner_machine') # 'owner_machine' (تماماً پای مالک) یا 'shared_trip'
    expense_date = db.Column(db.String(20), nullable=True) # تاریخ شمسی
    description = db.Column(db.String(255), nullable=True)
    receipt_image = db.Column(db.String(255), nullable=True)
    
    is_settled = db.Column(db.Boolean, default=False, index=True)
    settlement_id = db.Column(db.Integer, db.ForeignKey('settlements.id'), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'trip_id': self.trip_id,
            'trip_title': f"{self.trip.origin} به {self.trip.destination}" if self.trip else "خرج عمومی ماشین",
            'category': self.category,
            'amount': self.amount,
            'paid_by': self.paid_by,
            'liability': self.liability,
            'expense_date': self.expense_date,
            'description': self.description,
            'receipt_image': self.receipt_image,
            'is_settled': self.is_settled,
            'settlement_id': self.settlement_id,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else None
        }


class AdvancePayment(db.Model):
    __tablename__ = 'advance_payments'
    
    id = db.Column(db.Integer, primary_key=True)
    payer = db.Column(db.String(20), default='owner', index=True) # 'owner' (مساعده مالک به راننده) یا 'driver' (واریزی راننده به حساب مالک)
    amount = db.Column(db.BigInteger, nullable=False, default=0) # تومان
    payment_date = db.Column(db.String(20), nullable=True) # تاریخ شمسی
    payment_method = db.Column(db.String(50), default='کارت به کارت')
    tracking_code = db.Column(db.String(100), nullable=True) # کد پیگیری
    description = db.Column(db.String(255), nullable=True)
    receipt_image = db.Column(db.String(255), nullable=True)
    is_approved = db.Column(db.Boolean, default=True, index=True) # تایید شده توسط مالک (برای جلوگیری از ثبت دوباره)
    
    is_settled = db.Column(db.Boolean, default=False, index=True)
    settlement_id = db.Column(db.Integer, db.ForeignKey('settlements.id'), nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'payer': self.payer or 'owner',
            'amount': self.amount,
            'payment_date': self.payment_date,
            'payment_method': self.payment_method,
            'tracking_code': self.tracking_code,
            'description': self.description,
            'receipt_image': self.receipt_image,
            'is_approved': True if self.is_approved is None else self.is_approved,
            'is_settled': self.is_settled,
            'settlement_id': self.settlement_id,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else None
        }


class Settlement(db.Model):
    __tablename__ = 'settlements'
    
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(150), nullable=False) # عنوان تسویه
    settlement_date = db.Column(db.String(20), nullable=False) # تاریخ تسویه شمسی
    
    total_trips_count = db.Column(db.Integer, default=0)
    total_net_freight = db.Column(db.BigInteger, default=0) # کل صافی بارها
    
    # طلب راننده
    driver_earned_share = db.Column(db.BigInteger, default=0) # حق‌الزحمه ۲۰٪
    driver_paid_expenses = db.Column(db.BigInteger, default=0) # خرج‌هایی که راننده از جیبش داده
    driver_transfers_to_owner = db.Column(db.BigInteger, default=0) # واریزی‌های راننده به حساب مالک
    total_driver_credit = db.Column(db.BigInteger, default=0) # کل طلب = سهم + خرج راننده + واریزی به مالک
    
    # بدهی راننده
    driver_cash_collected = db.Column(db.BigInteger, default=0) # پیش‌کرایه نقدی دست راننده
    advances_paid_by_owner = db.Column(db.BigInteger, default=0) # واریزی‌های مالک به راننده
    total_driver_debit = db.Column(db.BigInteger, default=0) # کل بدهی = نقدینگی + مساعده‌ها
    
    # مانده نهایی
    # مثبت = مالک باید به راننده پرداخت کند
    # منفی = راننده باید به مالک پس دهد
    final_balance = db.Column(db.BigInteger, default=0)
    carried_forward_balance = db.Column(db.BigInteger, default=0) # مانده طلب/بدهی انتقال‌یافته از دوره قبل
    
    # تعدیلات دستی، پاداش، کسورات و سود خالص مالک
    adjustment_amount = db.Column(db.BigInteger, default=0) # تومان (مثبت برای پاداش به راننده، منفی برای کسورات/خسارت)
    adjustment_desc = db.Column(db.String(255), nullable=True) # شرح پاداش یا کسورات
    owner_net_profit = db.Column(db.BigInteger, default=0) # سود خالص مالک تریلی از این دوره کارکرد
    itemized_json = db.Column(db.Text, nullable=True) # ریز سند قطعی دوره به فرمت JSON جهت بایگانی ابدی

    status = db.Column(db.String(30), default='تسویه شده') # 'تسویه شده' یا 'پیش‌نویس'
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    trips = db.relationship('Trip', backref='settlement', lazy=True)
    expenses = db.relationship('Expense', backref='settlement', lazy=True)
    payments = db.relationship('AdvancePayment', backref='settlement', lazy=True)

    def to_dict(self):
        import json
        itemized_data = None
        if self.itemized_json:
            try:
                itemized_data = json.loads(self.itemized_json)
            except Exception:
                itemized_data = None

        if not itemized_data:
            # Fallback for historical settlements without JSON snapshot
            itemized_data = {
                'trips': [t.to_dict() for t in self.trips] if self.trips else [],
                'expenses': [e.to_dict() for e in self.expenses] if self.expenses else [],
                'payments': [p.to_dict() for p in self.payments] if self.payments else [],
                'adjustment_amount': self.adjustment_amount or 0,
                'adjustment_desc': self.adjustment_desc or '',
                'owner_net_profit': self.owner_net_profit or 0
            }

        return {
            'id': self.id,
            'title': self.title,
            'settlement_date': self.settlement_date,
            'total_trips_count': self.total_trips_count,
            'total_net_freight': self.total_net_freight,
            'driver_earned_share': self.driver_earned_share,
            'driver_paid_expenses': self.driver_paid_expenses,
            'driver_transfers_to_owner': self.driver_transfers_to_owner,
            'total_driver_credit': self.total_driver_credit,
            'driver_cash_collected': self.driver_cash_collected,
            'advances_paid_by_owner': self.advances_paid_by_owner,
            'total_driver_debit': self.total_driver_debit,
            'adjustment_amount': self.adjustment_amount or 0,
            'adjustment_desc': self.adjustment_desc or '',
            'owner_net_profit': self.owner_net_profit or 0,
            'final_balance': self.final_balance,
            'carried_forward_balance': getattr(self, 'carried_forward_balance', 0) or 0,
            'status': self.status,
            'notes': self.notes,
            'itemized': itemized_data,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else None
        }


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    action = db.Column(db.String(50), nullable=False) # CREATE, UPDATE, DELETE, SETTLE
    entity_type = db.Column(db.String(50), nullable=False) # Trip, Expense, AdvancePayment, Settlement, Setting
    entity_id = db.Column(db.Integer, nullable=True)
    actor_role = db.Column(db.String(20), default='system') # driver, owner, system
    details = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        return {
            'id': self.id,
            'action': self.action,
            'entity_type': self.entity_type,
            'entity_id': self.entity_id,
            'actor_role': self.actor_role,
            'details': self.details,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else None
        }


class ServiceLog(db.Model):
    __tablename__ = 'service_logs'

    id = db.Column(db.Integer, primary_key=True)
    service_type = db.Column(db.String(100), nullable=False, default='تعویض روغن موتور', index=True)
    service_category = db.Column(db.String(50), default='service', index=True) # 'service' (سرویس دوره‌ای) یا 'repair' (تعمیرگاه و قطعات)
    service_date = db.Column(db.String(20), nullable=True) # تاریخ شمسی
    current_km = db.Column(db.BigInteger, nullable=False, default=0) # کیلومتر فعلی
    next_km = db.Column(db.BigInteger, nullable=False, default=0) # کیلومتر تعویض بعدی
    oil_brand = db.Column(db.String(150), nullable=True) # برند و مشخصات روغن یا قطعه
    filters_replaced = db.Column(db.String(255), nullable=True) # فیلترها یا قطعات تعویض شده
    cost = db.Column(db.BigInteger, default=0) # هزینه سرویس یا تعمیرگاه
    paid_by = db.Column(db.String(20), default='owner') # owner یا driver
    shop_name = db.Column(db.String(150), nullable=True) # نام تعمیرگاه / مکانیکی / تعویض روغنی
    description = db.Column(db.String(255), nullable=True)
    receipt_image = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        remaining_km = max(0, (self.next_km or 0) - (self.current_km or 0))
        return {
            'id': self.id,
            'service_type': self.service_type,
            'service_category': getattr(self, 'service_category', 'service') or 'service',
            'service_date': self.service_date,
            'current_km': self.current_km,
            'next_km': self.next_km,
            'remaining_km': remaining_km,
            'oil_brand': self.oil_brand,
            'filters_replaced': self.filters_replaced,
            'cost': self.cost,
            'paid_by': self.paid_by,
            'shop_name': getattr(self, 'shop_name', None),
            'description': self.description,
            'receipt_image': self.receipt_image,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M') if self.created_at else None
        }
