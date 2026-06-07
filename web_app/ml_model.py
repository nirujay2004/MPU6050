import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, accuracy_score
import joblib
import os

# Get the correct path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def generate_training_data():
    """Generate realistic training data"""
    np.random.seed(42)
    data = []
    
    print("Generating training data...")
    
    # STABLE
    for _ in range(800):
        roll = np.random.normal(0, 3)
        pitch = np.random.normal(0, 3)
        temp = np.random.normal(24, 1.5)
        data.append([roll, pitch, temp, 'stable'])
    
    # ERRATIC
    for _ in range(800):
        roll = np.random.uniform(-60, 60) + np.random.normal(0, 15)
        pitch = np.random.uniform(-60, 60) + np.random.normal(0, 15)
        temp = np.random.normal(28, 3)
        data.append([roll, pitch, temp, 'erratic'])
    
    # ROTATING
    for _ in range(800):
        roll = np.random.uniform(-180, 180)
        pitch = np.random.normal(0, 20)
        temp = np.random.normal(26, 2)
        data.append([roll, pitch, temp, 'rotating'])
    
    # TILTED
    for _ in range(800):
        roll = np.random.choice([-60, -45, -30, 30, 45, 60])
        pitch = np.random.choice([-45, -30, -15, 15, 30, 45])
        temp = np.random.normal(23, 1.5)
        data.append([roll, pitch, temp, 'tilted'])
    
    df = pd.DataFrame(data, columns=['roll', 'pitch', 'temperature', 'motion_type'])
    df = df.sample(frac=1).reset_index(drop=True)
    return df

def train_model():
    """Train and save the model"""
    print("\n" + "="*60)
    print("🤖 Training Motion Classification Model")
    print("="*60)
    
    df = generate_training_data()
    print(f"\n📊 Dataset: {len(df)} samples")
    print("\nClass distribution:")
    print(df['motion_type'].value_counts())
    
    # Prepare features
    feature_cols = ['roll', 'pitch', 'temperature']
    X = df[feature_cols]
    y = df['motion_type']
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train model
    print("\n🧠 Training Random Forest...")
    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        random_state=42
    )
    model.fit(X_train_scaled, y_train)
    
    # Evaluate
    y_pred = model.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)
    
    print(f"\n✅ Model Accuracy: {accuracy:.2%}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))
    
    print("\nFeature Importance:")
    for feature, importance in zip(feature_cols, model.feature_importances_):
        print(f"  {feature}: {importance:.3f}")
    
    # Save model - Use correct path
    models_dir = os.path.join(BASE_DIR, 'models')
    os.makedirs(models_dir, exist_ok=True)
    
    model_path = os.path.join(models_dir, 'motion_classifier.pkl')
    scaler_path = os.path.join(models_dir, 'scaler.pkl')
    
    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)
    
    print(f"\n✅ Model saved to: {model_path}")
    print(f"✅ Scaler saved to: {scaler_path}")
    return model, scaler

if __name__ == '__main__':
    train_model()
    print("\n" + "="*60)
    print("✨ Training complete! Run 'python app.py' to start the dashboard")
    print("="*60)