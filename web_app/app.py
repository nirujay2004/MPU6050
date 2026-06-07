from flask import Flask, jsonify, render_template, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import serial
import serial.tools.list_ports
import threading
import time
import atexit
import joblib
import numpy as np
from collections import deque
import os
import sys

# Fix for web_app folder structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

app = Flask(__name__)
CORS(app)

# Configuration - Fixed paths
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{os.path.join(BASE_DIR, "sensor_data.db")}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Database Model
class SensorReading(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    ax = db.Column(db.Float)
    ay = db.Column(db.Float)
    az = db.Column(db.Float)
    gx = db.Column(db.Float)
    gy = db.Column(db.Float)
    gz = db.Column(db.Float)
    temperature = db.Column(db.Float)
    roll = db.Column(db.Float)
    pitch = db.Column(db.Float)
    motion_type = db.Column(db.String(50))
    confidence = db.Column(db.Float)
    
    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat(),
            'ax': self.ax, 'ay': self.ay, 'az': self.az,
            'gx': self.gx, 'gy': self.gy, 'gz': self.gz,
            'temperature': self.temperature,
            'roll': self.roll, 'pitch': self.pitch,
            'motion_type': self.motion_type,
            'confidence': self.confidence
        }

# Create tables
with app.app_context():
    db.create_all()
    print("✅ Database created/verified at:", os.path.join(BASE_DIR, "sensor_data.db"))

# Global variables
ser = None
latest_reading = {}
reading_history = deque(maxlen=200)
ml_model = None
scaler = None
serial_port_name = None
serial_connected = False

def find_arduino_port():
    """Automatically find Arduino/Wokwi serial port"""
    ports = serial.tools.list_ports.comports()
    
    print("\n🔍 Scanning for serial ports...")
    if not ports:
        print("   No ports found! Make sure Wokwi is running.")
        return None
        
    for port in ports:
        print(f"   Found: {port.device} - {port.description}")
        
        # Check for Wokwi virtual port
        if 'pipe' in port.device.lower() or 'wokwi' in port.description.lower():
            print(f"   ✅ Selected: {port.device}")
            return port.device
    
    # Try common ports
    import sys
    if sys.platform == 'win32':
        common_ports = ['COM5', 'COM4', 'COM3']
    elif sys.platform == 'darwin':
        common_ports = ['/dev/cu.usbmodem101', '/dev/cu.usbmodem201']
    else:
        common_ports = ['/dev/ttyACM0', '/dev/ttyUSB0']
    
    for port in common_ports:
        try:
            test_ser = serial.Serial(port, 9600, timeout=0.5)
            test_ser.close()
            print(f"   ✅ Selected: {port}")
            return port
        except:
            continue
    
    print("   ⚠️ No Wokwi port found. Will retry...")
    return None

def read_serial_data():
    """Background thread to read and parse serial data"""
    global ser, latest_reading, reading_history, serial_port_name, serial_connected
    
    while True:
        if not ser or not ser.is_open:
            serial_port_name = find_arduino_port()
            if serial_port_name:
                try:
                    ser = serial.Serial(serial_port_name, 9600, timeout=1)
                    serial_connected = True
                    print(f"\n✅ Connected to Arduino on {serial_port_name}")
                    print("   Waiting for sensor data...\n")
                    time.sleep(2)
                except Exception as e:
                    print(f"❌ Connection failed: {e}")
                    serial_connected = False
                    ser = None
                    time.sleep(5)
            else:
                time.sleep(5)
            continue
        
        try:
            if ser.in_waiting:
                line = ser.readline().decode('utf-8', errors='ignore').strip()
                
                if line and not line.startswith('MPU6050') and not line.startswith('Format:'):
                    parts = line.split(',')
                    if len(parts) == 9:
                        try:
                            data = {
                                'ax': float(parts[0]), 'ay': float(parts[1]), 'az': float(parts[2]),
                                'gx': float(parts[3]), 'gy': float(parts[4]), 'gz': float(parts[5]),
                                'temperature': float(parts[6]),
                                'roll': float(parts[7]), 'pitch': float(parts[8])
                            }
                            
                            # ML Prediction
                            motion_type = None
                            confidence = None
                            if ml_model and scaler:
                                features = np.array([[data['roll'], data['pitch'], data['temperature']]])
                                features_scaled = scaler.transform(features)
                                prediction = ml_model.predict(features_scaled)[0]
                                probabilities = ml_model.predict_proba(features_scaled)[0]
                                confidence = max(probabilities) * 100
                                motion_type = prediction
                            
                            # Save to database
                            new_reading = SensorReading(
                                ax=data['ax'], ay=data['ay'], az=data['az'],
                                gx=data['gx'], gy=data['gy'], gz=data['gz'],
                                temperature=data['temperature'],
                                roll=data['roll'], pitch=data['pitch'],
                                motion_type=motion_type, confidence=confidence
                            )
                            db.session.add(new_reading)
                            db.session.commit()
                            
                            # Update latest
                            latest_reading = data.copy()
                            latest_reading['timestamp'] = datetime.utcnow().isoformat()
                            latest_reading['motion_type'] = motion_type
                            latest_reading['confidence'] = confidence
                            reading_history.append(latest_reading.copy())
                            
                            # Console output
                            motion_str = f" | 🧠 {motion_type.upper()} ({confidence:.0f}%)" if motion_type else ""
                            print(f"📊 Roll={data['roll']:6.1f}° Pitch={data['pitch']:6.1f}° Temp={data['temperature']:5.1f}°C{motion_str}")
                                
                        except ValueError:
                            pass
        except Exception as e:
            print(f"Serial error: {e}")
            serial_connected = False
            ser = None
        
        time.sleep(0.01)

def load_ml_models():
    """Load pre-trained ML models"""
    global ml_model, scaler
    models_dir = os.path.join(BASE_DIR, 'models')
    model_path = os.path.join(models_dir, 'motion_classifier.pkl')
    scaler_path = os.path.join(models_dir, 'scaler.pkl')
    
    try:
        if os.path.exists(model_path) and os.path.exists(scaler_path):
            ml_model = joblib.load(model_path)
            scaler = joblib.load(scaler_path)
            print(f"✅ ML models loaded from {models_dir}")
            return True
        else:
            print(f"⚠️ ML models not found at {models_dir}")
            print("   Run 'python ml_model.py' to train the model")
            return False
    except Exception as e:
        print(f"❌ Error loading ML models: {e}")
        return False

# Start threads
serial_thread = threading.Thread(target=read_serial_data, daemon=True)
serial_thread.start()
load_ml_models()

# Flask Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/graph')
def graph():
    return render_template('graph.html')

@app.route('/ml-dashboard')
def ml_dashboard():
    return render_template('ml_dashboard.html')

@app.route('/api/latest')
def get_latest():
    if latest_reading:
        return jsonify(latest_reading)
    return jsonify({'status': 'waiting_for_data', 'message': 'No data yet'})

@app.route('/api/history')
def get_history():
    return jsonify(list(reading_history))

@app.route('/api/data')
def get_data():
    limit = request.args.get('limit', 100, type=int)
    readings = SensorReading.query.order_by(SensorReading.timestamp.desc()).limit(limit).all()
    return jsonify([r.to_dict() for r in readings])

@app.route('/api/stats')
def get_stats():
    total = SensorReading.query.count()
    if total > 0:
        avg_temp = db.session.query(db.func.avg(SensorReading.temperature)).scalar()
        motion_counts = {}
        for motion in ['stable', 'erratic', 'rotating', 'tilted']:
            count = SensorReading.query.filter_by(motion_type=motion).count()
            if count > 0:
                motion_counts[motion] = count
        
        return jsonify({
            'total_readings': total,
            'avg_temperature': round(avg_temp, 2) if avg_temp else 0,
            'motion_distribution': motion_counts,
            'serial_connected': serial_connected
        })
    return jsonify({'total_readings': 0, 'serial_connected': serial_connected})

@app.route('/api/port-info')
def get_port_info():
    return jsonify({
        'port': serial_port_name,
        'connected': serial_connected,
        'reading_count': len(reading_history)
    })

@app.route('/api/predict', methods=['POST'])
def predict():
    if not ml_model:
        return jsonify({'error': 'Model not loaded'}), 503
    
    data = request.json
    features = np.array([[data['roll'], data['pitch'], data.get('temperature', 25)]])
    features_scaled = scaler.transform(features)
    prediction = ml_model.predict(features_scaled)[0]
    probabilities = ml_model.predict_proba(features_scaled)[0].tolist()
    
    return jsonify({
        'prediction': prediction,
        'probabilities': probabilities,
        'classes': ml_model.classes_.tolist()
    })

@atexit.register
def cleanup():
    if ser and ser.is_open:
        ser.close()
        print("\n🔌 Serial connection closed")

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 MPU6050 Sensor Dashboard")
    print("="*60)
    print(f"📁 Project: {BASE_DIR}")
    print(f"🌐 Web Interface: http://localhost:5000")
    print(f"📊 Database: {os.path.join(BASE_DIR, 'sensor_data.db')}")
    print(f"🧠 Models: {os.path.join(BASE_DIR, 'models')}")
    print("="*60 + "\n")
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)