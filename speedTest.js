let state = {
    running: false,
    activeRequests: new Set(),
    speedSamples: [],
    pingSamples: [],
    totalBytes: 0,
    startTime: 0,
    lastUpdate: 0,
    connectionCount: 0,
    pingInterval: null
};

function calculateSpeed(samples, windowSize) {
    const now = performance.now();
    samples = samples.filter(sample => (now - sample.timestamp) < windowSize);
    
    if (samples.length < 2) return 0;

    const totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
    const weightedSpeed = samples.reduce((sum, sample) => sum + (sample.value * sample.weight), 0) / totalWeight;

    return weightedSpeed;
}

async function measurePing() {
    const start = performance.now();
    const randomFile = config.testFiles[Math.floor(Math.random() * config.testFiles.length)];
    
    try {
        await fetch(randomFile + '?r=' + Math.random(), { method: 'HEAD' });
        const ping = performance.now() - start;
        
        state.pingSamples.push({
            timestamp: performance.now(),
            value: ping,
            weight: 1
        });

        if (state.pingSamples.length > 10) {
            state.pingSamples.shift();
        }
    } catch (error) {
        console.error('Ping measurement failed:', error);
    }
}

async function downloadChunk() {
    if (!state.running) return;

    const file = config.testFiles[Math.floor(Math.random() * config.testFiles.length)];
    const requestId = Math.random();
    state.activeRequests.add(requestId);

    try {
        const response = await fetch(file + '?r=' + Math.random());
        const reader = response.body.getReader();
        
        while (state.running) {
            const {value, done} = await reader.read();
            if (done) break;
            
            const chunkSize = value.length;
            state.totalBytes += chunkSize;
            
            const now = performance.now();
            const timeDiff = (now - state.lastUpdate) / 1000;
            if (timeDiff > 0) {
                const instantSpeed = (chunkSize * 8 / (1024 * 1024)) / timeDiff;
                state.speedSamples.push({
                    timestamp: now,
                    value: instantSpeed,
                    weight: chunkSize
                });
                state.lastUpdate = now;
            }
        }
        
        reader.cancel();
    } catch (error) {
        console.error('Download chunk failed:', error);
    } finally {
        state.activeRequests.delete(requestId);
        if (state.running) {
            downloadChunk();
        }
    }
}

function updateUI() {
    if (!state.running) return;

    const speed = calculateSpeed(state.speedSamples, config.sampleWindow);
    const avgPing = calculateSpeed(state.pingSamples, config.sampleWindow);

    document.getElementById('result').textContent = 
        `Download: ${speed.toFixed(2)} Mbps`;
    document.getElementById('stats').textContent = 
        `Ping: ${avgPing.toFixed(0)}ms | Active Tests: ${state.activeRequests.size}`;

    if (state.running) {
        requestAnimationFrame(updateUI);
    }
}

function resetState() {
    state.speedSamples = [];
    state.pingSamples = [];
    state.totalBytes = 0;
    state.activeRequests.clear();
}

function startTest() {
    if (state.running) return;
    
    resetState();
    state.running = true;
    state.startTime = performance.now();
    state.lastUpdate = performance.now();

    for (let i = 0; i < config.batchSize; i++) {
        downloadChunk();
    }

    state.pingInterval = setInterval(measurePing, config.pingInterval);
    updateUI();
    
    document.getElementById('startButton').textContent = 'Stop Test';
    document.getElementById('result').textContent = 'Testing...';
}

function stopTest() {
    state.running = false;
    if (state.pingInterval) {
        clearInterval(state.pingInterval);
        state.pingInterval = null;
    }
    
    state.activeRequests.clear();
    
    document.getElementById('startButton').textContent = 'Start Test';
    document.getElementById('result').textContent = 'Test stopped';
    document.getElementById('stats').textContent = '';
}

function toggleTest() {
    if (state.running) {
        stopTest();
    } else {
        startTest();
    }
}
document.getElementById('result').textContent = 'Click Start Test to begin';
