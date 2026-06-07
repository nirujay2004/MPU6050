/**
 * MPU6050 Sensor Dashboard - Main JavaScript
 * Handles real-time data fetching, 3D visualization, charts, and ML predictions
 */

// Global variables
let updateInterval = null;
let chartInstances = {};
let socketConnected = false;
let lastDataPoint = null;
let animationFrameId = null;
let threeDScene = null;
let threeDCamera = null;
let threeDRenderer = null;
let threeDObject = null;
let threeDGroup = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatTimestamp(timestamp) {
    if (!timestamp) return '--:--:--';
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
}

function formatNumber(value, decimals = 2) {
    if (value === undefined || value === null) return '--';
    return Number(value).toFixed(decimals);
}

function getMotionBadgeClass(motionType) {
    const classes = {
        'stable': 'prediction-stable',
        'erratic': 'prediction-erratic',
        'rotating': 'prediction-rotating',
        'tilted': 'prediction-tilted'
    };
    return classes[motionType] || 'prediction-stable';
}

// ============================================
// API CALLS
// ============================================

async function fetchLatestData() {
    try {
        const response = await fetch('/api/latest');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (data && data.status !== 'waiting_for_data') {
            updateDashboardUI(data);
            update3DVisualization(data);
            return data;
        }
    } catch (error) {
        console.error('Error fetching latest data:', error);
        showConnectionError();
    }
    return null;
}

async function fetchHistoricalData(limit = 100) {
    try {
        const response = await fetch(`/api/data?limit=${limit}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        if (data && Array.isArray(data)) {
            updateCharts(data);
            return data;
        }
    } catch (error) {
        console.error('Error fetching historical data:', error);
    }
    return [];
}

async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const stats = await response.json();
        
        if (stats) {
            updateStatsUI(stats);
            return stats;
        }
    } catch (error) {
        console.error('Error fetching stats:', error);
    }
    return null;
}

async function fetchPortInfo() {
    try {
        const response = await fetch('/api/port-info');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const info = await response.json();
        updateConnectionStatus(info);
        return info;
    } catch (error) {
        console.error('Error fetching port info:', error);
    }
    return null;
}

async function makePrediction(roll, pitch, temperature) {
    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ roll, pitch, temperature })
        });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const prediction = await response.json();
        return prediction;
    } catch (error) {
        console.error('Error making prediction:', error);
        return null;
    }
}

// ============================================
// UI UPDATE FUNCTIONS
// ============================================

function updateDashboardUI(data) {
    // Update temperature
    const tempElement = document.getElementById('temp-value');
    if (tempElement && data.temperature !== undefined) {
        tempElement.innerHTML = `${formatNumber(data.temperature, 1)}<span class="stat-unit">°C</span>`;
    }
    
    // Update roll and pitch
    const rollElement = document.getElementById('roll-value');
    if (rollElement && data.roll !== undefined) {
        rollElement.innerHTML = `${formatNumber(data.roll, 1)}<span class="stat-unit">°</span>`;
    }
    
    const pitchElement = document.getElementById('pitch-value');
    if (pitchElement && data.pitch !== undefined) {
        pitchElement.innerHTML = `${formatNumber(data.pitch, 1)}<span class="stat-unit">°</span>`;
    }
    
    // Update accelerometer data
    const accelerometers = ['ax', 'ay', 'az'];
    accelerometers.forEach(axis => {
        const element = document.getElementById(axis);
        if (element && data[axis] !== undefined) {
            element.innerHTML = `${formatNumber(data[axis], 3)}<span class="stat-unit">g</span>`;
        }
    });
    
    // Update gyroscope data
    const gyroscopes = ['gx', 'gy', 'gz'];
    gyroscopes.forEach(axis => {
        const element = document.getElementById(axis);
        if (element && data[axis] !== undefined) {
            element.innerHTML = `${formatNumber(data[axis], 1)}<span class="stat-unit">°/s</span>`;
        }
    });
    
    // Update ML prediction
    if (data.motion_type) {
        const predictionLabel = document.getElementById('prediction-label');
        if (predictionLabel) {
            const badgeClass = getMotionBadgeClass(data.motion_type);
            predictionLabel.innerHTML = `<span class="prediction-badge ${badgeClass}">${data.motion_type.toUpperCase()}</span>`;
        }
        
        const confidenceText = document.getElementById('confidence-text');
        if (confidenceText && data.confidence) {
            confidenceText.innerHTML = `Confidence: ${formatNumber(data.confidence, 1)}%`;
        }
    }
    
    // Update timestamp
    const lastUpdate = document.getElementById('last-update');
    if (lastUpdate && data.timestamp) {
        lastUpdate.innerHTML = formatTimestamp(data.timestamp);
    }
}

function updateStatsUI(stats) {
    const totalReadings = document.getElementById('total-readings');
    if (totalReadings && stats.total_readings !== undefined) {
        totalReadings.innerHTML = stats.total_readings;
    }
    
    const avgTemp = document.getElementById('avg-temperature');
    if (avgTemp && stats.avg_temperature !== undefined) {
        avgTemp.innerHTML = `${formatNumber(stats.avg_temperature, 1)}<span class="stat-unit">°C</span>`;
    }
    
    // Update motion distribution if on ML dashboard
    if (stats.motion_distribution && window.location.pathname === '/ml-dashboard') {
        updateMotionDistribution(stats.motion_distribution);
    }
}

function updateMotionDistribution(distribution) {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    const motionTypes = ['stable', 'erratic', 'rotating', 'tilted'];
    
    motionTypes.forEach(type => {
        const count = distribution[type] || 0;
        const percentage = total > 0 ? (count / total * 100).toFixed(1) : 0;
        
        const element = document.getElementById(`dist-${type}`);
        if (element) {
            element.innerHTML = `${count} (${percentage}%)`;
        }
        
        const barElement = document.getElementById(`dist-bar-${type}`);
        if (barElement) {
            barElement.style.width = `${percentage}%`;
        }
    });
}

function updateConnectionStatus(info) {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.getElementById('ml-status-text');
    
    if (info.connected) {
        if (statusDot) statusDot.style.background = '#4ade80';
        if (statusText) {
            statusText.innerHTML = 'Connected';
            statusText.style.color = '#4ade80';
        }
    } else {
        if (statusDot) statusDot.style.background = '#ef4444';
        if (statusText) {
            statusText.innerHTML = 'Disconnected';
            statusText.style.color = '#ef4444';
        }
    }
}

function showConnectionError() {
    const statusText = document.getElementById('ml-status-text');
    if (statusText) {
        statusText.innerHTML = 'Connection Error';
        statusText.style.color = '#ef4444';
    }
}

// ============================================
// CHART FUNCTIONS
// ============================================

function initCharts() {
    // Accelerometer Chart
    const accelCtx = document.getElementById('accelChart')?.getContext('2d');
    if (accelCtx) {
        chartInstances.accel = new Chart(accelCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'X', borderColor: '#ef4444', data: [], tension: 0.4, fill: false },
                    { label: 'Y', borderColor: '#10b981', data: [], tension: 0.4, fill: false },
                    { label: 'Z', borderColor: '#3b82f6', data: [], tension: 0.4, fill: false }
                ]
            },
            options: getChartOptions('Accelerometer (g)')
        });
    }
    
    // Gyroscope Chart
    const gyroCtx = document.getElementById('gyroChart')?.getContext('2d');
    if (gyroCtx) {
        chartInstances.gyro = new Chart(gyroCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'X', borderColor: '#ef4444', data: [], tension: 0.4, fill: false },
                    { label: 'Y', borderColor: '#10b981', data: [], tension: 0.4, fill: false },
                    { label: 'Z', borderColor: '#3b82f6', data: [], tension: 0.4, fill: false }
                ]
            },
            options: getChartOptions('Gyroscope (°/s)')
        });
    }
    
    // Angle Chart
    const angleCtx = document.getElementById('angleChart')?.getContext('2d');
    if (angleCtx) {
        chartInstances.angle = new Chart(angleCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'Roll', borderColor: '#f59e0b', data: [], tension: 0.4, fill: false },
                    { label: 'Pitch', borderColor: '#8b5cf6', data: [], tension: 0.4, fill: false }
                ]
            },
            options: getChartOptions('Angle (degrees)')
        });
    }
    
    // Temperature Chart
    const tempCtx = document.getElementById('tempChart')?.getContext('2d');
    if (tempCtx) {
        chartInstances.temp = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    { label: 'Temperature', borderColor: '#ec489a', data: [], tension: 0.4, fill: false }
                ]
            },
            options: getChartOptions('Temperature (°C)')
        });
    }
}

function getChartOptions(yAxisLabel) {
    return {
        responsive: true,
        maintainAspectRatio: true,
        animation: {
            duration: 0 // Disable animations for better performance
        },
        scales: {
            x: {
                title: { display: true, text: 'Time (seconds ago)', color: '#fff' },
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: { color: '#fff' }
            },
            y: {
                title: { display: true, text: yAxisLabel, color: '#fff' },
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: { color: '#fff' }
            }
        },
        plugins: {
            legend: {
                labels: { color: '#fff' }
            },
            tooltip: {
                mode: 'index',
                intersect: false
            }
        }
    };
}

function updateCharts(data) {
    if (!data || data.length === 0) return;
    
    // Reverse to show oldest to newest
    const reversedData = [...data].reverse();
    const labels = reversedData.map((_, index) => index);
    
    // Update Accelerometer Chart
    if (chartInstances.accel) {
        chartInstances.accel.data.labels = labels;
        chartInstances.accel.data.datasets[0].data = reversedData.map(d => d.ax);
        chartInstances.accel.data.datasets[1].data = reversedData.map(d => d.ay);
        chartInstances.accel.data.datasets[2].data = reversedData.map(d => d.az);
        chartInstances.accel.update('none');
    }
    
    // Update Gyroscope Chart
    if (chartInstances.gyro) {
        chartInstances.gyro.data.labels = labels;
        chartInstances.gyro.data.datasets[0].data = reversedData.map(d => d.gx);
        chartInstances.gyro.data.datasets[1].data = reversedData.map(d => d.gy);
        chartInstances.gyro.data.datasets[2].data = reversedData.map(d => d.gz);
        chartInstances.gyro.update('none');
    }
    
    // Update Angle Chart
    if (chartInstances.angle) {
        chartInstances.angle.data.labels = labels;
        chartInstances.angle.data.datasets[0].data = reversedData.map(d => d.roll);
        chartInstances.angle.data.datasets[1].data = reversedData.map(d => d.pitch);
        chartInstances.angle.update('none');
    }
    
    // Update Temperature Chart
    if (chartInstances.temp) {
        chartInstances.temp.data.labels = labels;
        chartInstances.temp.data.datasets[0].data = reversedData.map(d => d.temperature);
        chartInstances.temp.update('none');
    }
}

// ============================================
// 3D VISUALIZATION (Three.js)
// ============================================

function init3DVisualization() {
    const container = document.getElementById('3d-container');
    if (!container) return;
    
    // Setup scene
    threeDScene = new THREE.Scene();
    threeDScene.background = new THREE.Color(0x0f0f1a);
    threeDScene.fog = new THREE.FogExp2(0x0f0f1a, 0.008);
    
    // Setup camera
    threeDCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    threeDCamera.position.set(3, 2, 5);
    threeDCamera.lookAt(0, 0, 0);
    
    // Setup renderer
    threeDRenderer = new THREE.WebGLRenderer({ antialias: true });
    threeDRenderer.setSize(container.clientWidth, container.clientHeight);
    threeDRenderer.shadowMap.enabled = true;
    container.appendChild(threeDRenderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404060);
    threeDScene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(2, 5, 3);
    directionalLight.castShadow = true;
    threeDScene.add(directionalLight);
    
    const fillLight = new THREE.PointLight(0x4466cc, 0.3);
    fillLight.position.set(0, -2, 0);
    threeDScene.add(fillLight);
    
    // Add grid helper
    const gridHelper = new THREE.GridHelper(8, 20, 0x88aaff, 0x335588);
    gridHelper.position.y = -1.2;
    threeDScene.add(gridHelper);
    
    // Create 3D object group
    threeDGroup = new THREE.Group();
    
    // Main cube
    const geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x3a86ff, 
        roughness: 0.3, 
        metalness: 0.7,
        emissive: 0x001133
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.castShadow = true;
    threeDGroup.add(cube);
    
    // Edges
    const edgesGeo = new THREE.EdgesGeometry(geometry);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x88ccff });
    const wireframe = new THREE.LineSegments(edgesGeo, edgesMat);
    threeDGroup.add(wireframe);
    
    // Inner core
    const coreGeo = new THREE.SphereGeometry(0.45, 24, 24);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xff6633, emissive: 0x442200 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    threeDGroup.add(core);
    
    threeDScene.add(threeDGroup);
    
    // Animation loop
    function animate() {
        if (!threeDRenderer || !threeDScene || !threeDCamera) return;
        requestAnimationFrame(animate);
        threeDRenderer.render(threeDScene, threeDCamera);
    }
    animate();
    
    // Handle resize
    window.addEventListener('resize', () => {
        if (threeDCamera && threeDRenderer && container) {
            threeDCamera.aspect = container.clientWidth / container.clientHeight;
            threeDCamera.updateProjectionMatrix();
            threeDRenderer.setSize(container.clientWidth, container.clientHeight);
        }
    });
}

function update3DVisualization(data) {
    if (!threeDGroup) return;
    
    if (data.roll !== undefined && data.pitch !== undefined) {
        const rollRad = data.roll * Math.PI / 180;
        const pitchRad = data.pitch * Math.PI / 180;
        
        threeDGroup.rotation.order = 'YXZ';
        threeDGroup.rotation.x = rollRad;
        threeDGroup.rotation.z = pitchRad;
    }
}

// ============================================
// TABLE UPDATE FUNCTIONS
// ============================================

function updatePredictionsTable(data) {
    const tableBody = document.getElementById('predictions-table');
    if (!tableBody) return;
    
    if (!data || data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No predictions yet</td></tr>';
        return;
    }
    
    tableBody.innerHTML = '';
    data.slice(0, 20).forEach(reading => {
        if (reading.motion_type) {
            const row = tableBody.insertRow();
            const badgeClass = getMotionBadgeClass(reading.motion_type);
            
            row.innerHTML = `
                <td style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);">${formatTimestamp(reading.timestamp)}</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);">${formatNumber(reading.roll, 1)}°</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);">${formatNumber(reading.pitch, 1)}°</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);">${formatNumber(reading.temperature, 1)}°C</td>
                <td style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <span class="prediction-badge ${badgeClass}" style="font-size: 0.8rem; padding: 0.25rem 0.75rem;">${reading.motion_type.toUpperCase()}</span>
                </td>
                <td style="padding: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05);">${formatNumber(reading.confidence, 1)}%</td>
            `;
        }
    });
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    console.log('Initializing MPU6050 Dashboard...');
    
    // Initialize charts
    initCharts();
    
    // Initialize 3D visualization if on main page
    if (document.getElementById('3d-container')) {
        init3DVisualization();
    }
    
    // Load initial data
    const historicalData = await fetchHistoricalData(100);
    if (historicalData.length > 0) {
        updateCharts(historicalData);
        updatePredictionsTable(historicalData);
    }
    
    await fetchStats();
    await fetchPortInfo();
    
    // Start real-time updates
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(async () => {
        const latestData = await fetchLatestData();
        if (latestData) {
            // Update predictions table with latest data
            const newHistory = await fetchHistoricalData(20);
            updatePredictionsTable(newHistory);
        }
        await fetchStats();
    }, 500);
    
    // Update connection status periodically
    setInterval(fetchPortInfo, 10000);
    
    console.log('Dashboard initialized successfully');
}

// Export functions for use in HTML
window.testPrediction = async function() {
    const roll = parseFloat(document.getElementById('test-roll')?.value || 0);
    const pitch = parseFloat(document.getElementById('test-pitch')?.value || 0);
    const temperature = parseFloat(document.getElementById('test-temp')?.value || 25);
    
    const prediction = await makePrediction(roll, pitch, temperature);
    
    if (prediction && document.getElementById('test-result')) {
        const badgeClass = getMotionBadgeClass(prediction.prediction);
        document.getElementById('test-result').style.display = 'block';
        document.getElementById('test-prediction-label').innerHTML = 
            `<span class="prediction-badge ${badgeClass}" style="font-size: 1.2rem;">${prediction.prediction.toUpperCase()}</span>`;
        
        if (prediction.probabilities) {
            let probText = '<div style="margin-top: 0.5rem; font-size: 0.9rem;">Probabilities: ';
            for (let i = 0; i < prediction.classes.length; i++) {
                probText += `${prediction.classes[i]}: ${(prediction.probabilities[i] * 100).toFixed(1)}% `;
            }
            probText += '</div>';
            const existingDiv = document.getElementById('test-result').querySelector('.probabilities');
            if (existingDiv) existingDiv.remove();
            const probDiv = document.createElement('div');
            probDiv.className = 'probabilities';
            probDiv.innerHTML = probText;
            document.getElementById('test-result').appendChild(probDiv);
        }
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}