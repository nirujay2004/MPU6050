#include <Wire.h>
#include <Arduino.h>
#include <math.h>

// MPU6050 I2C address
const int MPU6050_ADDR = 0x68;

// Register addresses
const int ACCEL_XOUT_H = 0x3B;
const int ACCEL_YOUT_H = 0x3D;
const int ACCEL_ZOUT_H = 0x3F;
const int TEMP_OUT_H = 0x41;
const int GYRO_XOUT_H = 0x43;
const int GYRO_YOUT_H = 0x45;
const int GYRO_ZOUT_H = 0x47;

// Variables for raw data
int16_t accelX, accelY, accelZ;
int16_t gyroX, gyroY, gyroZ;
int16_t temperatureRaw;

// Variables for converted data
float ax, ay, az;        // Accelerometer values in g
float gx, gy, gz;        // Gyroscope values in degrees/second
float temperature;       // Temperature in °C

// Calculated angles
float roll, pitch;

// Timing for consistent output
unsigned long lastPrint = 0;
const int printInterval = 100; // Print every 100ms

// Function prototypes
void setup();
void loop();
int16_t read16BitRegister(int reg);
void readMPU6050Data();
void convertData();
void calculateAngles();
void sendJSONData();
void sendCompactData();

void setup() {
    Serial.begin(9600);
    Wire.begin();
    
    // Initialize MPU6050 - wake up the device
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(0x6B);  // PWR_MGMT_1 register
    Wire.write(0);     // Write 0 to wake up MPU6050
    Wire.endTransmission();
    
    delay(100);
    
    // Print header for Python parser
    Serial.println("MPU6050 Sensor Started");
    Serial.println("Format: ACCEL: X,Y,Z | GYRO: X,Y,Z | TEMP: C | ROLL,PITCH");
}

void loop() {
    // Read all data
    readMPU6050Data();
    
    // Convert raw values to meaningful units
    convertData();
    
    // Calculate roll and pitch angles
    calculateAngles();
    
    // Send data at regular intervals
    if (millis() - lastPrint >= printInterval) {
        sendCompactData();  // Easy-to-parse format for Python
        lastPrint = millis();
    }
    
    delay(10); // Small delay for stability
}

int16_t read16BitRegister(int reg) {
    int16_t value = 0;
    
    // Request the register data
    Wire.beginTransmission(MPU6050_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    
    // Read 2 bytes from the register
    Wire.requestFrom(MPU6050_ADDR, 2);
    while(Wire.available() < 2);
    
    uint8_t highByte = Wire.read();
    uint8_t lowByte = Wire.read();
    
    // Combine high and low bytes into 16-bit value
    value = (highByte << 8) | lowByte;
    
    return value;
}

void readMPU6050Data() {
    // Read Accelerometer data (16-bit values)
    accelX = read16BitRegister(ACCEL_XOUT_H);
    accelY = read16BitRegister(ACCEL_YOUT_H);
    accelZ = read16BitRegister(ACCEL_ZOUT_H);
    
    // Read Gyroscope data
    gyroX = read16BitRegister(GYRO_XOUT_H);
    gyroY = read16BitRegister(GYRO_YOUT_H);
    gyroZ = read16BitRegister(GYRO_ZOUT_H);
    
    // Read Temperature data
    temperatureRaw = read16BitRegister(TEMP_OUT_H);
}

void convertData() {
    // Convert accelerometer values to g (assuming ±2g range)
    // Sensitivity for ±2g range is 16384 LSB/g
    ax = accelX / 16384.0;
    ay = accelY / 16384.0;
    az = accelZ / 16384.0;
    
    // Convert gyroscope values to degrees/second (assuming ±250°/s range)
    // Sensitivity for ±250°/s range is 131 LSB/°/s
    gx = gyroX / 131.0;
    gy = gyroY / 131.0;
    gz = gyroZ / 131.0;
    
    // Convert temperature
    // Temperature in °C = (TEMP_OUT / 340.0) + 36.53
    temperature = (temperatureRaw / 340.0) + 36.53;
}

void calculateAngles() {
    // Calculate roll (X-axis rotation)
    roll = atan2(ay, az) * 180 / PI;
    
    // Calculate pitch (Y-axis rotation)
    pitch = atan2(-ax, sqrt(ay*ay + az*az)) * 180 / PI;
}

void sendCompactData() {
    // Send data in CSV format: ax,ay,az,gx,gy,gz,temp,roll,pitch
    // This is the easiest format for Python to parse
    Serial.print(ax, 3); Serial.print(",");
    Serial.print(ay, 3); Serial.print(",");
    Serial.print(az, 3); Serial.print(",");
    Serial.print(gx, 2); Serial.print(",");
    Serial.print(gy, 2); Serial.print(",");
    Serial.print(gz, 2); Serial.print(",");
    Serial.print(temperature, 2); Serial.print(",");
    Serial.print(roll, 2); Serial.print(",");
    Serial.println(pitch, 2);
}

void sendJSONData() {
    // Alternative JSON format (commented out for performance)
    // Serial.print("{\"ax\":");
    // Serial.print(ax, 3);
    // Serial.print(",\"ay\":");
    // Serial.print(ay, 3);
    // Serial.print(",\"az\":");
    // Serial.print(az, 3);
    // Serial.print(",\"gx\":");
    // Serial.print(gx, 2);
    // Serial.print(",\"gy\":");
    // Serial.print(gy, 2);
    // Serial.print(",\"gz\":");
    // Serial.print(gz, 2);
    // Serial.print(",\"temp\":");
    // Serial.print(temperature, 2);
    // Serial.print(",\"roll\":");
    // Serial.print(roll, 2);
    // Serial.print(",\"pitch\":");
    // Serial.print(pitch, 2);
    // Serial.println("}");
}