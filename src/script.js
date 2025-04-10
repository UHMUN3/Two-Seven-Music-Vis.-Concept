import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import GUI from 'lil-gui'

/**
 * Base
 */
// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

/**
 * Textures
 */
const textureLoader = new THREE.TextureLoader()
const particlesTexture = textureLoader.load('./textures/particles/mm.png')

/**
 * Particles
 */
const particlesGeometry = new THREE.BufferGeometry()
const count = 2000
const positions = new Float32Array(count * 3)
const colors = new Float32Array(count * 3)

const radius = 2  // Radius of the sphere

// Set the particle positions to form a sphere
for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2  // Random angle (0 to 2 * pi)
    const phi = Math.acos(2 * Math.random() - 1)  // Random angle (0 to pi)

    const x = radius * Math.sin(phi) * Math.cos(theta)  // Spherical to Cartesian conversion
    const y = radius * Math.sin(phi) * Math.sin(theta)
    const z = radius * Math.cos(phi)

    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    colors[i * 3] = (Math.random() - 0.2)
    colors[i * 3 + 1] = (Math.random() - 0.2)
    colors[i * 3 + 2] = (Math.random() - 0.2)
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

const particlesMaterial = new THREE.PointsMaterial({
    size: 0.1,
    sizeAttenuation: true,
    color: 'white',
    opacity: 10,
    alphaMap: particlesTexture,
    transparent: true,
    depthWrite: false,
})
particlesMaterial.blending = THREE.AdditiveBlending
particlesMaterial.vertexColors = true

const particles = new THREE.Points(particlesGeometry, particlesMaterial)
scene.add(particles)

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
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
camera.position.set(0, 5, 0)  // Move camera higher up along the Y-axis
camera.lookAt(0, 0, 0)  // Make the camera look at the center of the scene (the particles)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.maxPolarAngle = Math.PI / 2  // Limit vertical rotation to prevent flipping

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

/**
 * Audio Setup
 */
let analyser, dataArray

async function captureTabAudio() {
    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
    })

    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioContext.createMediaStreamSource(stream)

    analyser = audioContext.createAnalyser()
    source.connect(analyser)
    analyser.fftSize = 512
    dataArray = new Uint8Array(analyser.frequencyBinCount)
}

// Optional: overlay to prompt user to click
const overlay = document.createElement('div')
overlay.id = 'startOverlay'
overlay.style = `
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.9);
    color: white;
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    cursor: pointer;
`
overlay.innerText = 'Click to start visualizer with tab audio'
document.body.appendChild(overlay)

document.body.addEventListener('click', () => {
    if (!analyser) {
        captureTabAudio().then(() => {
            overlay.style.display = 'none'
        })
    }
}, { once: true })

/**
 * Animate
 */
const clock = new THREE.Clock()

const tick = () =>
{
    const elapsedTime = clock.getElapsedTime()

     // Add rotation to particles
     particles.rotation.x = elapsedTime * 0.1 // Rotation speed on the x-axis
     particles.rotation.y = elapsedTime * 0.05 // Rotation speed on the y-axis
 

    if (analyser) {
        analyser.getByteFrequencyData(dataArray)

        for (let i = 0; i < count; i++) {
            const i3 = i * 3
            const freqValue = dataArray[i % dataArray.length] / 255

            // Y bounce
            particlesGeometry.attributes.position.array[i3 + 1] = freqValue * (1.5 - 1) % 2

            // Color
            const color = new THREE.Color()
            color.setHSL(freqValue * 0.8, 1, 0.7)
            particlesGeometry.attributes.color.array[i3] = color.r
            particlesGeometry.attributes.color.array[i3 + 1] = color.g
            particlesGeometry.attributes.color.array[i3 + 2] = color.b
        }

        particlesGeometry.attributes.position.needsUpdate = true
        particlesGeometry.attributes.color.needsUpdate = true
    }

    controls.update()
    renderer.render(scene, camera)
    window.requestAnimationFrame(tick)
}

tick()
