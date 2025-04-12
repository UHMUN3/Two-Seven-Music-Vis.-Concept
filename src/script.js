import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import GUI from 'lil-gui'

/**
 * Base
 */
const canvas = document.querySelector('canvas.webgl')
const scene = new THREE.Scene()

/**
 * GUI
 */
const gui = new GUI()
gui.close()
const params = {
    lowColor: '#ff0000', // Red for low frequencies
    highColor: '#008000', // Green for high frequencies
    saturation: 1.0,
    particleSize: 0.09,
    particleOpacity: 5,
    audioSensitivity: 1.5
}

gui.addColor(params, 'lowColor').name('Low Frequency Color')
gui.addColor(params, 'highColor').name('High Frequency Color')
gui.add(params, 'saturation', 0, 1).name('Color Saturation')
gui.add(params, 'particleSize', 0.01, 0.2).name('Particle Size').onChange(value => {
    if (particlesMaterial) {
        particlesMaterial.size = value
    }
})
gui.add(params, 'particleOpacity', 0.1, 10).name('Particle Opacity').onChange(value => {
    if (particlesMaterial) {
        particlesMaterial.opacity = value
    }
})
gui.add(params, 'audioSensitivity', 0.1, 3).name('Audio Sensitivity')

/**
 * Textures
 */
const textureLoader = new THREE.TextureLoader()
const particlesTexture = textureLoader.load('./textures/particles/mm.png')

/**
 * Particle Geometry from SVG
 */
const particlesGeometry = new THREE.BufferGeometry()
const loader = new SVGLoader()

const particlesMaterial = new THREE.PointsMaterial({
    size: params.particleSize,
    sizeAttenuation: true,
    color: 'white',
    opacity: params.particleOpacity,
    alphaMap: particlesTexture,
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    blending: THREE.AdditiveBlending
})

let particles; // Declare particles variable in outer scope

loader.load('./textures/particles/centered.svg', svgData => {
    const paths = svgData.paths
    let allPoints = []
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

    paths.forEach(path => {
        if (path.subPaths) {
            path.subPaths.forEach(subPath => {
                const points = subPath.getPoints(100)
                allPoints = allPoints.concat(points)

                // Update bounding box
                points.forEach(p => {
                    if (p.x < minX) minX = p.x
                    if (p.x > maxX) maxX = p.x
                    if (p.y < minY) minY = p.y
                    if (p.y > maxY) maxY = p.y
                })
            })
        } else {
            const points = path.getPoints(100)
            allPoints = allPoints.concat(points)

            // Update bounding box
            points.forEach(p => {
                if (p.x < minX) minX = p.x
                if (p.x > maxX) maxX = p.x
                if (p.y < minY) minY = p.y
                if (p.y > maxY) maxY = p.y
            })
        }
    })

    // Calculate center and scale
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const svgWidth = maxX - minX
    const svgHeight = maxY - minY
    const scale = Math.min(5 / svgWidth, 5 / svgHeight)

    // Convert points to a Float32Array for BufferGeometry
    const positions = new Float32Array(allPoints.length * 3)
    const colors = new Float32Array(allPoints.length * 3)
    const baseZPositions = new Float32Array(allPoints.length)

    allPoints.forEach((p, i) => {
        const x = (p.x - centerX) * scale
        const y = -(p.y - centerY) * scale
        const z = (Math.random() - 0.5) * 0.2

        positions[i * 3] = x
        positions[i * 3 + 1] = y
        positions[i * 3 + 2] = z

        baseZPositions[i] = z

        colors[i * 3] = Math.random()
        colors[i * 3 + 1] = Math.random()
        colors[i * 3 + 2] = Math.random()
    })

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    particlesGeometry.setAttribute('baseZ', new THREE.BufferAttribute(baseZPositions, 1))

    particles = new THREE.Points(particlesGeometry, particlesMaterial)
    scene.add(particles)
})

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(0, 0, 10)
camera.lookAt(0, 0, 0)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI / 2

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(0x000000, 1) // Set background color to black

/**
 * Audio Setup with Screen Capture API for cross-tab audio
 */
let analyser, dataArray, audioContext
let frequencyDataHistory = []
const HISTORY_SIZE = 10

// Create default frequency data in case of no audio
function createDefaultFrequencyData() {
    const size = 1024
    const data = new Uint8Array(size)
    
    for (let i = 0; i < size; i++) {
        // Create a curve that peaks in the middle
        const x = i / size
        const value = Math.sin(x * Math.PI) * 100
        data[i] = value + Math.random() * 20 // Add some randomness
    }
    
    return data
}

// Initialize default data
const defaultFrequencyData = createDefaultFrequencyData()

// Detect if device is mobile
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

// Capture system audio using getDisplayMedia (allows capturing audio from any screen, window, or tab)
async function captureSystemAudio() {
    try {
        // Note: the options below no longer force current tab capture, so users can choose any screen, window, or tab.
        const gdmOptions = {
            video: {
                displaySurface: 'browser',
                width: { ideal: 1 },
                height: { ideal: 1 },
                frameRate: { ideal: 1 }
            },
            audio: {
                // Request system audio (from the chosen tab/window)
                displaySurface: 'browser',
                suppressLocalAudioPlayback: false
            }
        }

        // Show a helpful message for users
        const message = document.createElement('div')
        message.style = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            max-width: 80%;
            text-align: center;
            z-index: 10000;
            font-family: sans-serif;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        `
        
        // Adjusted instructions for users: they are free to select any tab/window.
        if (isMobileDevice()) {
            message.innerHTML = `
                <h3>Share Audio Permission Needed</h3>
                <p>Please choose an option to share device audio when prompted.</p>
                <p>For mobile users: You may need to share your entire screen or a specific app that is playing audio.</p>
                <p>Your screen will be captured but only the audio will be used for the visualizer.</p>
            `
        } else {
            message.innerHTML = `
                <h3>Share Audio Permission Needed</h3>
                <p>Please select a source to share audio (screen, window, or tab) when your browser prompts you.</p>
                <p>On Chrome/Edge: Choose 'Chrome Tab', 'Window', or 'Your Entire Screen' and make sure to enable 'Share audio'</p>
                <p>On Firefox: Choose the desired source and ensure the audio is shared</p>
                <p>Only the audio will be used for the visualizer.</p>
            `
        }
        
        document.body.appendChild(message)

        // Request display media with audio; the user can now select any tab/window
        const stream = await navigator.mediaDevices.getDisplayMedia(gdmOptions)
        
        // Remove the message once the user has granted permission
        document.body.removeChild(message)
        
        // Check if an audio track was provided
        const audioTrack = stream.getAudioTracks()[0]
        if (!audioTrack) {
            throw new Error('No audio track found in the captured stream')
        }
        
        // Create an audio context if it does not exist
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)()
            analyser = audioContext.createAnalyser()
            analyser.fftSize = 2048
            dataArray = new Uint8Array(analyser.frequencyBinCount)
            
            // Initialize the frequency data history
            for (let i = 0; i < HISTORY_SIZE; i++) {
                frequencyDataHistory.push(new Uint8Array(analyser.frequencyBinCount))
            }
        }
        
        // Connect the captured stream to the audio context
        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)
        // Do not connect to destination to avoid any feedback issues
        
        // Visual indicator that audio capture is active
        const indicator = document.createElement('div')
        indicator.style = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.7);
            color: #4CAF50;
            padding: 10px;
            border-radius: 5px;
            font-family: sans-serif;
            font-size: 14px;
            z-index: 1000;
            display: flex;
            align-items: center;
        `
        indicator.innerHTML = `
            <div style="width: 10px; height: 10px; background: #4CAF50; border-radius: 50%; margin-right: 8px;"></div>
            Audio Capture Active
        `
        document.body.appendChild(indicator)
        
        // Clean up indicator when the audio track ends
        audioTrack.addEventListener('ended', () => {
            console.log('Audio capture ended')
            if (indicator && indicator.parentNode) {
                document.body.removeChild(indicator)
            }
        })
        
        return true
    } catch (error) {
        console.error('Error capturing system audio:', error)
        alert('Could not capture system audio: ' + error.message)
        return false
    }
}

// Create start button/overlay
const overlay = document.createElement('div')
overlay.id = 'startOverlay'
overlay.style = `
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.9);
    color: white;
    font-size: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 10;
    cursor: pointer;
    font-family: sans-serif;
`

const startButton = document.createElement('button')
startButton.textContent = 'Start The Visualizer'
startButton.style = `
    padding: 15px 30px;
    font-size: 18px;
    background: #000000;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
`

const description = document.createElement('div')
description.style = `
    font-size: 16px;
    max-width: 80%;
    text-align: center;
    line-height: 1.5;
    margin-bottom: 30px;
`
description.innerHTML = `
    This visualizer requires permission to capture your device audio<br>
    Click the button and follow the prompts to choose a source<br>
    (You can play audio from any tab. Just make sure you have it ready before starting)<br>
    <span style="font-size: 14px; opacity: 0.8;">(Epilepsy warning!!! I AM NOT LIABLE!!!)</span>
`

overlay.appendChild(description)
overlay.appendChild(startButton)
document.body.appendChild(overlay)

// Initialize audio on button click
startButton.addEventListener('click', async () => {
    try {
        if (await captureSystemAudio()) {
            overlay.style.display = 'none'
        }
    } catch (err) {
        console.error('Failed to start audio capture:', err)
        
        // Display error message on failure
        const errorMsg = document.createElement('div')
        errorMsg.style = `
            color: #ff5252;
            margin-top: 20px;
            padding: 10px;
            background: rgba(255,82,82,0.1);
            border-radius: 5px;
            max-width: 80%;
            text-align: center;
        `
        errorMsg.textContent = `Error: ${err.message}. Your browser might not support system audio capture.`
        overlay.appendChild(errorMsg)
    }
})

/**
 * Helper function to interpolate between colors
 */
function lerpColor(a, b, t) {
    const colorA = new THREE.Color(a)
    const colorB = new THREE.Color(b)
    return new THREE.Color().lerpColors(colorA, colorB, t)
}

/**
 * Audio frequency bands management
 * Add controllers for low and high frequency bands
 */
const frequencyParams = {
    lowFreqStart: 0,
    lowFreqEnd: 32,
    highFreqStart: 100,
    highFreqEnd: 200
}

const frequencyFolder = gui.addFolder('Frequency Bands')
frequencyFolder.add(frequencyParams, 'lowFreqStart', 0, 100).step(1).name('Low Freq Start')
frequencyFolder.add(frequencyParams, 'lowFreqEnd', 1, 200).step(1).name('Low Freq End')
frequencyFolder.add(frequencyParams, 'highFreqStart', 0, 500).step(1).name('High Freq Start')
frequencyFolder.add(frequencyParams, 'highFreqEnd', 1, 1024).step(1).name('High Freq End')

/**
 * Animate Block
 */
const clock = new THREE.Clock()

const tick = () => {
    const elapsedTime = clock.getElapsedTime()

    if (particles) {
        particles.rotation.x = Math.sin(elapsedTime) * 0.5
        particles.rotation.y = Math.sin(elapsedTime * 0.05) * 0.3

        // Get current frequency data
        let currentFrequencyData
        
        if (analyser && dataArray) {
            // Get actual audio frequency data if available
            analyser.getByteFrequencyData(dataArray)
            currentFrequencyData = dataArray
        } else {
            // Fallback default data with dynamic effect
            currentFrequencyData = defaultFrequencyData.map((val, i) => {
                return val * (0.7 + 0.3 * Math.sin(elapsedTime * 2 + i * 0.01))
            })
        }
        
        if (particlesGeometry.attributes.position) {
            // Extract frequency bins based on GUI settings
            const lowFreqBins = currentFrequencyData.slice(
                frequencyParams.lowFreqStart, 
                frequencyParams.lowFreqEnd
            )
            
            const highFreqBins = currentFrequencyData.slice(
                frequencyParams.highFreqStart, 
                frequencyParams.highFreqEnd
            )

            // Average and normalize with sensitivity adjustment
            const lowFreqEnergy = lowFreqBins.length > 0 
                ? lowFreqBins.reduce((sum, val) => sum + val, 0) / lowFreqBins.length 
                : 0
            const normalizedLowFreq = Math.min(1, (lowFreqEnergy / 255) * params.audioSensitivity)
            
            const highFreqEnergy = highFreqBins.length > 0
                ? highFreqBins.reduce((sum, val) => sum + val, 0) / highFreqBins.length
                : 0
            const normalizedHighFreq = Math.min(1, (highFreqEnergy / 255) * params.audioSensitivity)

            const positionAttr = particlesGeometry.attributes.position
            const baseZ = particlesGeometry.attributes.baseZ
            const colorAttr = particlesGeometry.attributes.color

            for (let i = 0; i < positionAttr.count; i++) {
                const i3 = i * 3
                const freqIndex = i % currentFrequencyData.length
                const freqValue = Math.min(1, (currentFrequencyData[freqIndex] / 255) * params.audioSensitivity)

                // Calculate bounce amount based on frequency data
                const bounce = Math.sin(elapsedTime * 5 + i * 0.1) * (0.2 + normalizedLowFreq * 1.2) * freqValue
                positionAttr.array[i3 + 2] = baseZ.array[i] + bounce

                // Determine color blend factor: different particles respond to different frequencies
                let blendFactor
                if (freqIndex < frequencyParams.lowFreqEnd) {
                    blendFactor = 0.2 + normalizedLowFreq * 0.8
                } else if (freqIndex > frequencyParams.highFreqStart) {
                    blendFactor = 0.2 + normalizedHighFreq * 0.8
                } else {
                    blendFactor = freqValue
                }
                
                // Use GUI colors for interpolation
                const color = lerpColor(params.lowColor, params.highColor, blendFactor)
                
                // Apply GUI saturation setting
                const hsl = {}
                color.getHSL(hsl)
                color.setHSL(hsl.h, params.saturation, hsl.l)
                
                colorAttr.array[i3] = color.r
                colorAttr.array[i3 + 1] = color.g
                colorAttr.array[i3 + 2] = color.b
            }

            positionAttr.needsUpdate = true
            colorAttr.needsUpdate = true
        }
    }

    controls.update()
    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}

tick()
