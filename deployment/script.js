// ============================================
// STELLARION - FURNITURE WEBSITE
// Complete JavaScript Implementation with Three.js
// Senior Frontend Engineer - Production Ready
// ============================================

// ============================================
// CURRENCY CONFIGURATION
// ============================================
const EXCHANGE_RATE = 35; // 1 USD = 35 THB (Thai Baht)

// ============================================
// API CONFIGURATION
// ============================================
const API_KEY = 'msy_BO62XMcAXyvcYttvXRLCQx4OSnyKJaUHCoOG';
const MESHY_API_URL = 'https://api.meshy.ai/v2';
const USE_BACKEND = true; // Set to false to use direct API calls
const BACKEND_URL = 'http://localhost:3000';

// ============================================
// MESHY API FUNCTIONS (BACKEND OR DIRECT)
// ============================================

/**
 * Convert product image to 3D model using Meshy API
 * @param {string} imageUrl - URL of the product image
 * @param {string} productName - Name of the product
 * @returns {Promise} Task ID for tracking
 */
async function convertImageTo3D(imageUrl, productName) {
    try {
        showNotification('Starting 3D model generation...');
        
        if (USE_BACKEND) {
            // Use backend server (API key hidden)
            console.log('Using backend server:', BACKEND_URL);
            
            const response = await fetch(`${BACKEND_URL}/api/create-3d-model`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageUrl: imageUrl,
                    productName: productName
                })
            });

            const data = await response.json();
            console.log('Backend Response:', data);

            if (data.success) {
                showNotification('3D model generation started! This may take a few minutes.');
                return data.taskId;
            } else {
                // Extract detailed error message
                let errorMsg = 'Failed to start generation';
                if (typeof data.error === 'string') {
                    errorMsg = data.error;
                } else if (data.error && data.error.message) {
                    errorMsg = data.error.message;
                } else if (data.error) {
                    errorMsg = JSON.stringify(data.error);
                }
                console.error('API Error:', errorMsg, data);
                throw new Error(errorMsg);
            }
        } else {
            // Direct API call (API key exposed)
            console.log('Using direct API call to Meshy');
            
            const response = await fetch(`${MESHY_API_URL}/image-to-3d-tasks`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    image_url: imageUrl,
                    enable_pbr: true,
                    name: productName,
                    ai_model: 'meshy-4',
                    topology: 'quad',
                    target_polycount: 30000
                })
            });

            const data = await response.json();
            console.log('Meshy API Response:', data);

            if (response.ok && data.result) {
                showNotification('3D model generation started! This may take a few minutes.');
                return data.result;
            } else {
                const errorMsg = data.message || data.error || JSON.stringify(data);
                console.error('API Error Details:', data);
                throw new Error(errorMsg);
            }
        }
    } catch (error) {
        console.error('Error converting image to 3D:', error);
        
        // Better error message extraction
        let errorMessage = 'Unknown error';
        if (error.message) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else {
            errorMessage = JSON.stringify(error);
        }
        
        console.error('Full error details:', error);
        showNotification('❌ Error: ' + errorMessage);
        throw new Error(errorMessage);
    }
}

/**
 * Check 3D model generation status
 * @param {string} taskId - Meshy task ID
 * @returns {Promise} Status information
 */
async function check3DStatus(taskId) {
    try {
        if (USE_BACKEND) {
            const response = await fetch(`${BACKEND_URL}/api/check-status/${taskId}`);
            const data = await response.json();

            if (data.success) {
                return {
                    status: data.status,
                    progress: data.progress,
                    modelUrl: data.modelUrl,
                    thumbnailUrl: data.thumbnailUrl
                };
            } else {
                throw new Error(data.error);
            }
        } else {
            const response = await fetch(`${MESHY_API_URL}/image-to-3d-tasks/${taskId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                return {
                    status: data.status,
                    progress: data.progress,
                    modelUrl: data.model_urls?.glb,
                    thumbnailUrl: data.thumbnail_url
                };
            } else {
                throw new Error(data.message || 'Failed to check status');
            }
        }
    } catch (error) {
        console.error('Error checking 3D status:', error);
        throw error;
    }
}

/**
 * Poll for 3D model completion
 * @param {string} taskId - Meshy task ID
 * @param {function} onProgress - Progress callback
 * @returns {Promise} Model URL when complete
 */
async function waitFor3DCompletion(taskId, onProgress) {
    return new Promise((resolve, reject) => {
        const pollInterval = setInterval(async () => {
            try {
                const status = await check3DStatus(taskId);
                
                if (onProgress) {
                    onProgress(status);
                }

                if (status.status === 'SUCCEEDED') {
                    clearInterval(pollInterval);
                    resolve(status.modelUrl);
                } else if (status.status === 'FAILED') {
                    clearInterval(pollInterval);
                    reject(new Error('3D model generation failed'));
                }
            } catch (error) {
                clearInterval(pollInterval);
                reject(error);
            }
        }, 5000); // Check every 5 seconds
    });
}

/**
 * List all 3D models
 * @returns {Promise} Array of models
 */
async function listAllModels() {
    try {
        if (USE_BACKEND) {
            const response = await fetch(`${BACKEND_URL}/api/models`);
            const data = await response.json();

            if (data.success) {
                return data.models || [];
            } else {
                throw new Error(data.error || 'Failed to list models');
            }
        } else {
            const response = await fetch(`${MESHY_API_URL}/image-to-3d?pageSize=20`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${API_KEY}`
                }
            });

            const data = await response.json();

            if (response.ok) {
                return data.models || [];
            } else {
                throw new Error(data.message || 'Failed to list models');
            }
        }
    } catch (error) {
        console.error('Error listing models:', error);
        return [];
    }
}

/**
 * Format price in dual currency (USD and THB)
 * @param {number} usdPrice - Price in US Dollars
 * @returns {object} Object with formatted USD and THB prices
 */
function formatDualCurrency(usdPrice) {
    const thbPrice = Math.round(usdPrice * EXCHANGE_RATE);
    return {
        usd: `$${usdPrice.toFixed(2)}`,
        thb: `฿${thbPrice.toLocaleString()}`,
        usdValue: usdPrice,
        thbValue: thbPrice
    };
}

// ============================================
// THREE.JS GLOBAL VARIABLES
// ============================================
let scene, camera, renderer, controls;
let currentModel = null;

// ============================================
// PRODUCT DATA
// ============================================
// ============================================
// PRODUCTS DATA
// ============================================

const products = [
    {
        id: 1,
        name: "Luxury Velvet Sectional Sofa",
        price: 2499,
        category: "living-room",
        image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=600&fit=crop&q=80",
        model3D: "3d%20model/sectional%20sofa%203d%20model.glb",
        description: "Exquisite L-shaped sectional sofa with premium velvet upholstery, deep cushioning, and elegant gold-finished legs. Perfect centerpiece for sophisticated living spaces."
    },
    {
        id: 2,
        name: "Modern Platform Bed",
        price: 1299,
        category: "bedroom",
        image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=400&h=300&fit=crop",
        model3D: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb",
        description: "King-size bed with sleek contemporary design"
    },
    {
        id: 3,
        name: "Marble Dining Table",
        price: 1599,
        category: "dining",
        image: "https://images.unsplash.com/photo-1617806118233-18e1de247200?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "8-seater table with genuine Italian marble top"
    },
    {
        id: 4,
        name: "Executive Desk",
        price: 799,
        category: "office",
        image: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Solid wood desk with leather inlay"
    },
    {
        id: 5,
        name: "Leather Recliner",
        price: 699,
        category: "living-room",
        image: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Premium leather reclining chair with ottoman"
    },
    {
        id: 6,
        name: "Crystal Chandelier",
        price: 459,
        category: "living-room",
        image: "https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "18-light crystal chandelier with gold finish"
    },
    {
        id: 7,
        name: "Upholstered Armchair",
        price: 399,
        category: "living-room",
        image: "https://images.unsplash.com/photo-1581539250439-c96689b516dd?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Comfortable accent chair with button tufting"
    },
    {
        id: 8,
        name: "Oak Bookshelf",
        price: 549,
        category: "storage",
        image: "https://images.unsplash.com/photo-1594620302200-9a762244a156?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Solid oak bookshelf with adjustable shelves"
    },
    {
        id: 9,
        name: "Nightstand Set",
        price: 299,
        category: "bedroom",
        image: "https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Matching pair of elegant bedside tables"
    },
    {
        id: 10,
        name: "Dining Chair Set",
        price: 599,
        category: "dining",
        image: "https://images.unsplash.com/photo-1598300188225-3ab2e0f2f04e?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Set of 6 upholstered dining chairs"
    },
    {
        id: 11,
        name: "Glass Coffee Table",
        price: 399,
        category: "living-room",
        image: "https://images.unsplash.com/photo-1601366533654-2f39cfaa8549?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Tempered glass top with chrome base"
    },
    {
        id: 12,
        name: "Patio Lounge Set",
        price: 1299,
        category: "outdoor",
        image: "https://images.unsplash.com/photo-1600210492493-0946911123ea?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Weather-resistant outdoor seating set"
    },
    {
        id: 13,
        name: "Ergonomic Office Chair",
        price: 449,
        category: "office",
        image: "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Lumbar support with adjustable armrests"
    },
    {
        id: 14,
        name: "Wardrobe Cabinet",
        price: 999,
        category: "bedroom",
        image: "https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Large wardrobe with mirrored doors"
    },
    {
        id: 15,
        name: "Console Table",
        price: 349,
        category: "living-room",
        image: "https://images.unsplash.com/photo-1611269154421-4e27233ac5c7?w=400&h=300&fit=crop",
        model3D: "./3D model/sofa_-_game_ready_model.glb",
        description: "Narrow console with drawer storage"
    }
];

// ============================================
// STATE MANAGEMENT
// ============================================
let cart = JSON.parse(localStorage.getItem('stellarion_cart')) || [];
let wishlist = JSON.parse(localStorage.getItem('stellarion_wishlist')) || [];
let currentProduct = null;
let currentUser = JSON.parse(localStorage.getItem('stellarion_user')) || null;

// ============================================
// 3D VIEWER FUNCTIONALITY WITH THREE.JS
// ============================================

/**
 * Initialize Three.js scene, camera, renderer, and controls
 * @param {HTMLElement} container - Container element for the 3D viewer
 */
function initThreeJS(container) {
    // Clear existing content
    container.innerHTML = '';
    
    // Create scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xFAFAF8);
    
    // Create camera
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1, 5);
    
    // Create renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);
    
    const hemisphereLight = new THREE.HemisphereLight(0xE8B86D, 0x2D3E50, 0.4);
    scene.add(hemisphereLight);
    
    // Add orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 10;
    controls.maxPolarAngle = Math.PI / 2;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2.0;
    
    // Add ground plane
    const groundGeometry = new THREE.CircleGeometry(10, 32);
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Handle window resize
    const handleResize = () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
    
    // Animation loop
    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();
}

/**
 * Load 3D model using GLTFLoader
 * @param {string} modelPath - Path to the GLTF/GLB model
 * @param {HTMLElement} container - Container element
 */
function loadThreeJSModel(modelPath, container) {
    console.log('Loading 3D model from:', modelPath);
    
    // URL encode the path to handle spaces and special characters
    const encodedPath = modelPath.replace(/ /g, '%20');
    console.log('Encoded path:', encodedPath);
    
    // Show loading spinner
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'absolute inset-0 flex items-center justify-center bg-light/50 z-10';
    loadingDiv.innerHTML = '<div class="loading-spinner"></div>';
    container.appendChild(loadingDiv);
    
    // Remove existing model
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }
    
    // Check if GLTFLoader exists
    if (!THREE.GLTFLoader) {
        console.error('GLTFLoader not found!');
        loadingDiv.remove();
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center text-luxury font-body p-8">
                <i class="fas fa-exclamation-triangle text-5xl mb-6 text-secondary"></i>
                <p class="text-xl mb-2 font-bold">3D Loader Error</p>
                <p class="text-sm text-luxury/60 mb-6">GLTFLoader library not loaded</p>
                <button onclick="close3DViewer()" class="bg-primary text-white px-6 py-3 uppercase tracking-wider hover:bg-secondary transition-colors">
                    Close
                </button>
            </div>
        `;
        return;
    }
    
    // Load new model
    const loader = new THREE.GLTFLoader();
    
    loader.load(
        encodedPath,
        (gltf) => {
            console.log('Model loaded successfully:', gltf);
            
            // Remove loading spinner
            loadingDiv.remove();
            
            currentModel = gltf.scene;
            
            // Enable shadows
            currentModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            
            // Center and scale model
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 3 / maxDim;
            currentModel.scale.multiplyScalar(scale);
            
            // Re-center after scaling
            const newBox = new THREE.Box3().setFromObject(currentModel);
            const newCenter = newBox.getCenter(new THREE.Vector3());
            currentModel.position.sub(newCenter);
            currentModel.position.y = 0;
            
            scene.add(currentModel);
            
            showNotification('3D model loaded! Drag to rotate, scroll to zoom.');
        },
        (progress) => {
            // Optional: Update loading progress
            if (progress.total > 0) {
                const percentComplete = (progress.loaded / progress.total) * 100;
                console.log(`Loading: ${percentComplete.toFixed(2)}%`);
            } else {
                console.log(`Loaded: ${progress.loaded} bytes`);
            }
        },
        (error) => {
            console.error('Error loading model:', error);
            loadingDiv.remove();
            
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center text-luxury font-body p-8 text-center">
                    <i class="fas fa-exclamation-triangle text-5xl mb-6 text-secondary"></i>
                    <p class="text-xl mb-2 font-bold">Unable to load 3D model</p>
                    <p class="text-sm text-luxury/60 mb-2">File: ${modelPath}</p>
                    <p class="text-xs text-luxury/50 mb-4">Error: ${error.message || 'File not found or invalid format'}</p>
                    <div class="bg-accent/30 p-4 rounded mb-4 text-left text-xs text-luxury/70">
                        <p class="font-bold mb-2">Troubleshooting:</p>
                        <ul class="list-disc list-inside space-y-1">
                            <li>Check if the file exists in the "3D model" folder</li>
                            <li>Make sure the file name matches exactly</li>
                            <li>Verify the GLB file is not corrupted</li>
                            <li>Try using a different 3D model file</li>
                        </ul>
                    </div>
                    <button onclick="close3DViewer()" class="bg-primary text-white px-6 py-3 uppercase tracking-wider hover:bg-secondary transition-colors">
                        Close
                    </button>
                </div>
            `;
        }
    );
}

/**
 * Opens the 3D viewer modal and loads the specified model using Three.js
 * @param {string} modelPath - Path to the .glb or .gltf model file
 * @param {string} productName - Name of the product to display
 */
function open3DViewer(modelPath, productName) {
    const modal = document.getElementById('viewer3DModal');
    const title = document.getElementById('viewer3DTitle');
    const container = document.getElementById('viewer3DContainer');

    // Show modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Update title
    title.textContent = productName;

    // Initialize Three.js
    initThreeJS(container);
    
    // Load the model
    loadThreeJSModel(modelPath, container);
}

/**
 * Closes the 3D viewer modal and cleans up Three.js resources
 */
function close3DViewer() {
    const modal = document.getElementById('viewer3DModal');
    const container = document.getElementById('viewer3DContainer');

    // Hide modal
    modal.classList.add('hidden');
    modal.classList.remove('flex');

    // Clean up Three.js resources
    if (renderer) {
        renderer.dispose();
        renderer = null;
    }
    if (controls) {
        controls.dispose();
        controls = null;
    }
    if (currentModel) {
        scene.remove(currentModel);
        currentModel = null;
    }
    scene = null;
    camera = null;
    
    // Clear container
    container.innerHTML = '';
}

/**
 * Shows 3D viewer for a specific product
 * @param {number} productId - ID of the product
 */
function show3DViewer(productId) {
    const product = products.find(p => p.id === productId);
    if (product && product.model3D) {
        currentProduct = product;
        open3DViewer(product.model3D, product.name);
    } else {
        console.error('Product not found or no 3D model available');
    }
}

// ============================================
// CART FUNCTIONALITY
// ============================================

/**
 * Add product to cart
 */
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    saveCart();
    updateCartUI();
    showNotification(`${product.name} added to cart!`);
}

/**
 * Remove product from cart
 */
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart();
    updateCartUI();
}

/**
 * Update product quantity in cart
 */
function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    if (!item) return;

    item.quantity += change;
    
    if (item.quantity <= 0) {
        removeFromCart(productId);
    } else {
        saveCart();
        updateCartUI();
    }
}

/**
 * Save cart to localStorage
 */
function saveCart() {
    localStorage.setItem('stellarion_cart', JSON.stringify(cart));
}

/**
 * Update cart UI
 */
function updateCartUI() {
    // Update cart count badge
    const cartCount = document.getElementById('cartCount');
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;

    // Update cart items display
    const cartItems = document.getElementById('cartItems');
    const cartTotal = document.getElementById('cartTotal');

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="text-center py-16">
                <i class="fas fa-shopping-bag text-6xl text-luxury/20 mb-4"></i>
                <p class="text-luxury/60 font-body">Your cart is empty</p>
            </div>
        `;
        const emptyPrices = formatDualCurrency(0);
        cartTotal.innerHTML = `
            <div class="text-right">
                <div class="text-2xl font-bold text-secondary">${emptyPrices.usd}</div>
                <div class="text-sm text-luxury/60 font-body">${emptyPrices.thb} THB</div>
            </div>
        `;
        return;
    }

    let total = 0;
    let html = '';

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        
        const itemPrices = formatDualCurrency(item.price);
        const itemTotalPrices = formatDualCurrency(itemTotal);

        html += `
            <div class="flex gap-4 mb-4 pb-4 border-b luxury-border">
                <img src="${item.image}" alt="${item.name}" class="w-24 h-24 object-cover">
                <div class="flex-1">
                    <h4 class="font-bold text-primary mb-1">${item.name}</h4>
                    <p class="text-sm text-luxury/70 font-body mb-2">${item.description}</p>
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <button onclick="updateQuantity(${item.id}, -1)" class="w-8 h-8 bg-accent hover:bg-secondary hover:text-white text-primary font-bold transition-colors">-</button>
                            <span class="font-body font-bold">${item.quantity}</span>
                            <button onclick="updateQuantity(${item.id}, 1)" class="w-8 h-8 bg-accent hover:bg-secondary hover:text-white text-primary font-bold transition-colors">+</button>
                        </div>
                        <div class="text-right">
                            <div class="font-bold text-secondary">${itemTotalPrices.usd}</div>
                            <div class="text-sm text-luxury/60 font-body">${itemTotalPrices.thb}</div>
                            <button onclick="removeFromCart(${item.id})" class="text-xs text-luxury/60 hover:text-primary font-body mt-1">Remove</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });

    cartItems.innerHTML = html;
    
    const totalPrices = formatDualCurrency(total);
    cartTotal.innerHTML = `
        <div class="text-right">
            <div class="text-2xl font-bold text-secondary">${totalPrices.usd}</div>
            <div class="text-sm text-luxury/60 font-body">${totalPrices.thb} THB</div>
        </div>
    `;
}

// ============================================
// WISHLIST FUNCTIONALITY
// ============================================

/**
 * Toggle product in wishlist
 */
function toggleWishlist(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const index = wishlist.findIndex(item => item.id === productId);
    
    if (index > -1) {
        wishlist.splice(index, 1);
        showNotification(`${product.name} removed from wishlist`);
    } else {
        wishlist.push(product);
        showNotification(`${product.name} added to wishlist!`);
    }

    saveWishlist();
    updateWishlistUI();
    renderWishlistModal();
    renderProducts();
}

/**
 * Save wishlist to localStorage
 */
function saveWishlist() {
    localStorage.setItem('stellarion_wishlist', JSON.stringify(wishlist));
}

/**
 * Update wishlist UI
 */
function updateWishlistUI() {
    const wishlistCount = document.getElementById('wishlistCount');
    wishlistCount.textContent = wishlist.length;
}

/**
 * Render wishlist modal
 */
function renderWishlistModal() {
    const wishlistItems = document.getElementById('wishlistItems');
    
    if (!wishlistItems) return;
    
    if (wishlist.length === 0) {
        wishlistItems.innerHTML = `
            <div class="text-center py-16">
                <i class="fas fa-heart text-6xl text-luxury/20 mb-4"></i>
                <p class="text-luxury/60 font-body text-lg mb-2">Your wishlist is empty</p>
                <p class="text-sm text-luxury/50 font-body">Add items you love to your wishlist</p>
            </div>
        `;
        return;
    }
    
    wishlistItems.innerHTML = wishlist.map(product => {
        const prices = formatDualCurrency(product.price);
        return `
            <div class="flex gap-4 mb-4 pb-4 border-b luxury-border group hover:bg-accent/20 p-4 transition-all">
                <img src="${product.image}" alt="${product.name}" class="w-32 h-32 object-cover">
                <div class="flex-1">
                    <div class="flex items-start justify-between mb-2">
                        <div>
                            <span class="text-xs text-secondary font-body font-semibold uppercase tracking-wider">${product.category.replace('-', ' ')}</span>
                            <h4 class="font-bold text-primary text-lg">${product.name}</h4>
                        </div>
                        <button onclick="toggleWishlist(${product.id})" class="text-secondary hover:text-luxury/60 transition-colors">
                            <i class="fas fa-times text-xl"></i>
                        </button>
                    </div>
                    <p class="text-sm text-luxury/70 font-body mb-3">${product.description}</p>
                    <div class="flex items-center justify-between">
                        <div>
                            <div class="text-xl font-bold text-secondary">${prices.usd}</div>
                            <div class="text-sm text-luxury/60 font-body">${prices.thb} THB</div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="show3DViewer(${product.id})" class="bg-accent hover:bg-secondary hover:text-white text-primary font-body font-bold py-2 px-4 transition-all text-sm uppercase tracking-wider">
                                <i class="fas fa-cube mr-1"></i> View 3D
                            </button>
                            <button onclick="addToCart(${product.id})" class="bg-primary hover:bg-secondary text-white hover:text-primary font-body font-bold py-2 px-4 transition-all text-sm uppercase tracking-wider">
                                <i class="fas fa-shopping-bag mr-1"></i> Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Check if product is in wishlist
 */
function isInWishlist(productId) {
    return wishlist.some(item => item.id === productId);
}

// ============================================
// USER PROFILE FUNCTIONALITY
// ============================================

/**
 * Show login modal
 */
function showLoginModal() {
    const modal = document.getElementById('userModal');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const profileView = document.getElementById('profileView');
    
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Show login form by default
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (profileView) profileView.classList.add('hidden');
    }
}

/**
 * Show register form
 */
function showRegisterForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) loginForm.classList.add('hidden');
    if (registerForm) registerForm.classList.remove('hidden');
}

/**
 * Show login form
 */
function showLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) loginForm.classList.remove('hidden');
    if (registerForm) registerForm.classList.add('hidden');
}

/**
 * Close user modal
 */
function closeUserModal() {
    const modal = document.getElementById('userModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Handle user login
 */
function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    // Simple validation (in production, this would be handled by backend)
    const users = JSON.parse(localStorage.getItem('stellarion_users')) || [];
    const user = users.find(u => u.email === email && u.password === password);
    
    if (user) {
        currentUser = {
            name: user.name,
            email: user.email,
            phone: user.phone || '',
            address: user.address || '',
            joinDate: user.joinDate
        };
        
        localStorage.setItem('stellarion_user', JSON.stringify(currentUser));
        updateUserUI();
        closeUserModal();
        showNotification(`Welcome back, ${user.name}!`);
    } else {
        showNotification('Invalid email or password');
    }
}

/**
 * Handle user registration
 */
function handleRegister(event) {
    event.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    // Validation
    if (password !== confirmPassword) {
        showNotification('Passwords do not match');
        return;
    }
    
    // Check if user already exists
    const users = JSON.parse(localStorage.getItem('stellarion_users')) || [];
    if (users.find(u => u.email === email)) {
        showNotification('Email already registered');
        return;
    }
    
    // Create new user
    const newUser = {
        name,
        email,
        password,
        phone: '',
        address: '',
        joinDate: new Date().toISOString()
    };
    
    users.push(newUser);
    localStorage.setItem('stellarion_users', JSON.stringify(users));
    
    // Auto login
    currentUser = {
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        address: newUser.address,
        joinDate: newUser.joinDate
    };
    
    localStorage.setItem('stellarion_user', JSON.stringify(currentUser));
    updateUserUI();
    closeUserModal();
    showNotification(`Welcome to Stellarion, ${name}!`);
}

/**
 * Handle user logout
 */
function handleLogout() {
    currentUser = null;
    localStorage.removeItem('stellarion_user');
    updateUserUI();
    closeUserModal();
    showNotification('Logged out successfully');
}

/**
 * Show user profile
 */
function showUserProfile() {
    if (!currentUser) {
        showLoginModal();
        return;
    }
    
    const modal = document.getElementById('userModal');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const profileView = document.getElementById('profileView');
    
    if (modal && profileView) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        profileView.classList.remove('hidden');
        
        // Update profile information
        document.getElementById('profileName').textContent = currentUser.name;
        document.getElementById('profileEmail').textContent = currentUser.email;
        document.getElementById('profilePhone').textContent = currentUser.phone || 'Not set';
        document.getElementById('profileAddress').textContent = currentUser.address || 'Not set';
        
        const joinDate = new Date(currentUser.joinDate);
        document.getElementById('profileJoinDate').textContent = joinDate.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
}

/**
 * Update user UI based on login status
 */
function updateUserUI() {
    const userBtn = document.getElementById('userBtn');
    
    if (userBtn) {
        if (currentUser) {
            userBtn.innerHTML = `<i class="fas fa-user-circle text-lg text-secondary"></i>`;
            userBtn.title = currentUser.name;
        } else {
            userBtn.innerHTML = `<i class="fas fa-user text-lg text-primary"></i>`;
            userBtn.title = 'Login';
        }
    }
}

// ============================================
// PRODUCT RENDERING
// ============================================

/**
 * Create product card HTML
 */
function createProductCard(product) {
    const isWishlisted = isInWishlist(product.id);
    const heartClass = isWishlisted ? 'fas text-secondary' : 'far text-luxury/40';
    const prices = formatDualCurrency(product.price);

    return `
        <div class="product-card bg-white shadow-lg hover:shadow-2xl luxury-border overflow-hidden">
            <div class="product-image-container">
                <img src="${product.image}" alt="${product.name}" class="w-full h-64 object-cover">
                <button class="view-3d-btn" onclick="show3DViewer(${product.id})">
                    <i class="fas fa-cube mr-1"></i> View in 3D
                </button>
            </div>
            <div class="p-6">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1">
                        <span class="text-xs text-secondary font-body font-semibold uppercase tracking-wider">${product.category.replace('-', ' ')}</span>
                        <h3 class="text-xl font-bold text-primary mt-1 mb-2">${product.name}</h3>
                    </div>
                    <button onclick="toggleWishlist(${product.id})" class="p-2 hover:bg-accent/30 rounded-full transition-all">
                        <i class="${heartClass} fa-heart text-lg"></i>
                    </button>
                </div>
                <p class="text-sm text-luxury/70 font-body mb-4 line-clamp-2">${product.description}</p>
                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <div class="text-2xl font-bold text-secondary">${prices.usd}</div>
                        <div class="text-sm text-luxury/60 font-body">${prices.thb} THB</div>
                    </div>
                    <button onclick="addToCart(${product.id})" class="bg-primary hover:bg-secondary text-white hover:text-primary font-body font-bold py-2.5 px-6 transition-all text-sm uppercase tracking-wider">
                        <i class="fas fa-shopping-bag mr-1"></i> Add
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Render products to grid
 */
function renderProducts(filteredProducts = products) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;

    if (filteredProducts.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-20">
                <i class="fas fa-search text-6xl text-luxury/20 mb-4"></i>
                <p class="text-luxury/60 font-body text-xl">No products found</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filteredProducts.map(product => createProductCard(product)).join('');
}

// ============================================
// FILTERING & SEARCH
// ============================================

/**
 * Filter products based on current filter values
 */
function filterProducts() {
    const categoryFilter = document.getElementById('categoryFilter').value;
    const priceFilter = document.getElementById('priceFilter').value;
    const sortFilter = document.getElementById('sortFilter').value;
    const searchInput = document.getElementById('searchInput').value.toLowerCase();

    let filtered = [...products];

    // Category filter
    if (categoryFilter !== 'all') {
        filtered = filtered.filter(p => p.category === categoryFilter);
    }

    // Price filter
    if (priceFilter !== 'all') {
        if (priceFilter === '0-100') {
            filtered = filtered.filter(p => p.price < 100);
        } else if (priceFilter === '100-300') {
            filtered = filtered.filter(p => p.price >= 100 && p.price < 300);
        } else if (priceFilter === '300-500') {
            filtered = filtered.filter(p => p.price >= 300 && p.price < 500);
        } else if (priceFilter === '500+') {
            filtered = filtered.filter(p => p.price >= 500);
        }
    }

    // Search filter
    if (searchInput) {
        filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(searchInput) ||
            p.description.toLowerCase().includes(searchInput) ||
            p.category.toLowerCase().includes(searchInput)
        );
    }

    // Sorting
    if (sortFilter === 'price-low') {
        filtered.sort((a, b) => a.price - b.price);
    } else if (sortFilter === 'price-high') {
        filtered.sort((a, b) => b.price - a.price);
    } else if (sortFilter === 'name') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    }

    renderProducts(filtered);
}

/**
 * Search products
 */
function searchProducts(query) {
    const searchTerm = query.toLowerCase();
    const filtered = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm) ||
        p.category.toLowerCase().includes(searchTerm)
    );
    renderProducts(filtered);
}

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Show notification message
 */
function showNotification(message) {
    // Remove existing notification
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();

    // Create notification
    const notification = document.createElement('div');
    notification.className = 'notification-toast fixed top-24 right-8 bg-primary text-white px-6 py-4 shadow-2xl z-[70] animate-slideInLeft';
    notification.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fas fa-check-circle text-secondary text-xl"></i>
            <span class="font-body font-semibold">${message}</span>
        </div>
    `;

    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.transition = 'opacity 0.5s ease';
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// ============================================
// ADMIN MODAL FUNCTIONS
// ============================================

let currentTaskId = null;

/**
 * Open admin modal
 */
function openAdminModal() {
    const adminModal = document.getElementById('adminModal');
    if (adminModal) {
        adminModal.classList.remove('hidden');
        adminModal.classList.add('flex');
        
        // Update server status
        const statusEl = document.getElementById('serverStatus');
        if (statusEl) {
            if (USE_BACKEND) {
                statusEl.innerHTML = '<i class="fas fa-server mr-1"></i>Backend Mode: localhost:3000 ✅';
                statusEl.className = 'text-xs text-green-300';
            } else {
                statusEl.innerHTML = '<i class="fas fa-cloud mr-1"></i>Direct API Mode';
                statusEl.className = 'text-xs text-yellow-300';
            }
        }
        
        loadRecentModels();
    }
}

/**
 * Close admin modal
 */
function closeAdminModal() {
    const adminModal = document.getElementById('adminModal');
    if (adminModal) {
        adminModal.classList.add('hidden');
        adminModal.classList.remove('flex');
        resetGenerationForm();
    }
}

// ============================================
// FIREBASE UPLOAD FUNCTIONS
// ============================================

let uploadedImageUrl = null;

/**
 * Load an example image URL
 */
function useExampleURL() {
    const exampleURLs = [
        'https://images.unsplash.com/photo-1555041469-a586c61ea9bc', // Modern sofa
        'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e', // Contemporary sofa
        'https://images.unsplash.com/photo-1586023492125-27b2c045efd7', // Luxury sofa
        'https://images.unsplash.com/photo-1540574163026-643ea20ade25' // Leather sofa
    ];
    
    const randomURL = exampleURLs[Math.floor(Math.random() * exampleURLs.length)];
    document.getElementById('imageUrlInput').value = randomURL;
    showNotification('✅ Example URL loaded! This is a valid direct image link.');
}

/**
 * Switch between URL and Upload tabs
 */
function switchTab(tab) {
    const urlTab = document.getElementById('urlTab');
    const uploadTab = document.getElementById('uploadTab');
    const urlContent = document.getElementById('urlTabContent');
    const uploadContent = document.getElementById('uploadTabContent');

    if (tab === 'url') {
        urlTab.classList.add('border-secondary', 'text-primary');
        urlTab.classList.remove('border-transparent', 'text-gray-500');
        uploadTab.classList.remove('border-secondary', 'text-primary');
        uploadTab.classList.add('border-transparent', 'text-gray-500');
        
        urlContent.classList.remove('hidden');
        uploadContent.classList.add('hidden');
        uploadedImageUrl = null;
    } else {
        uploadTab.classList.add('border-secondary', 'text-primary');
        uploadTab.classList.remove('border-transparent', 'text-gray-500');
        urlTab.classList.remove('border-secondary', 'text-primary');
        urlTab.classList.add('border-transparent', 'text-gray-500');
        
        uploadContent.classList.remove('hidden');
        urlContent.classList.add('hidden');
    }
}

/**
 * Handle file selection
 */
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
        showNotification('Please select an image file');
        return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showNotification('Image too large. Maximum size is 10MB');
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('previewImage').src = e.target.result;
        document.getElementById('uploadPreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);

    // Check if Firebase is available
    if (typeof firebase === 'undefined' || !firebase.storage) {
        showNotification('⚠️ Firebase not configured. Using free image hosting instead...');
        uploadToImgBB(file);
        return;
    }

    // Upload to Firebase
    uploadToFirebase(file);
}

/**
 * Upload image to Firebase Storage
 */
async function uploadToFirebase(file) {
    try {
        document.getElementById('uploadStatus').textContent = 'Uploading to Firebase...';
        showNotification('Uploading image to Firebase...');

        const storage = firebase.storage();
        const storageRef = storage.ref();
        const fileRef = storageRef.child(`product-images/${Date.now()}_${file.name}`);

        // Upload file
        const uploadTask = fileRef.put(file);

        uploadTask.on('state_changed',
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                document.getElementById('uploadStatus').textContent = `Uploading: ${Math.round(progress)}%`;
            },
            (error) => {
                console.error('Upload error:', error);
                showNotification('Upload failed: ' + error.message);
                document.getElementById('uploadStatus').textContent = 'Upload failed';
            },
            async () => {
                // Upload complete, get download URL
                uploadedImageUrl = await uploadTask.snapshot.ref.getDownloadURL();
                document.getElementById('uploadStatus').textContent = '✅ Upload complete!';
                showNotification('Image uploaded successfully!');
                console.log('Firebase URL:', uploadedImageUrl);
            }
        );
    } catch (error) {
        console.error('Firebase upload error:', error);
        showNotification('Firebase upload failed. Trying alternative method...');
        uploadToImgBB(file);
    }
}

/**
 * Upload image to ImgBB (free alternative to Firebase)
 */
async function uploadToImgBB(file) {
    try {
        document.getElementById('uploadStatus').textContent = 'Uploading to ImgBB...';
        showNotification('Uploading image to free hosting...');

        const formData = new FormData();
        formData.append('image', file);

        // Using ImgBB free API (no key required for basic usage)
        // For production, get your own key from https://api.imgbb.com/
        const response = await fetch('https://api.imgbb.com/1/upload?key=demo_key', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('ImgBB upload failed');
        }

        const data = await response.json();
        
        if (data.success && data.data && data.data.url) {
            uploadedImageUrl = data.data.url;
            document.getElementById('uploadStatus').textContent = '✅ Upload complete!';
            showNotification('Image uploaded successfully!');
            console.log('ImgBB URL:', uploadedImageUrl);
        } else {
            throw new Error('Invalid response from ImgBB');
        }
    } catch (error) {
        console.error('ImgBB upload error:', error);
        document.getElementById('uploadStatus').textContent = '❌ Upload failed';
        showNotification('❌ Upload failed. Please use URL method instead or check TROUBLESHOOTING.md');
    }
}

/**
 * Test API connection
 */
async function testAPIConnection() {
    try {
        showNotification('Testing API connection...');
        console.log('Testing Meshy API with key:', API_KEY.substring(0, 20) + '...');
        
        // Try to list models to test connection
        const response = await fetch(`${MESHY_API_URL}/image-to-3d?pageSize=1`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        const data = await response.json();
        console.log('API Test Response:', response.status, data);

        if (response.ok) {
            showNotification('✅ API connection successful! Ready to generate models.');
            alert('API Connection Test: SUCCESS\n\nYour API key is working correctly.\nYou can now generate 3D models!');
        } else {
            const errorMsg = data.message || data.error || 'Unknown error';
            showNotification('❌ API test failed: ' + errorMsg);
            alert(`API Connection Test: FAILED\n\nError: ${errorMsg}\n\nStatus Code: ${response.status}\n\nPlease check:\n1. API key is correct\n2. You have API credits remaining\n3. Meshy service is online`);
        }
    } catch (error) {
        console.error('API test error:', error);
        showNotification('❌ Connection error: ' + error.message);
        alert(`API Connection Test: ERROR\n\nError: ${error.message}\n\nThis might mean:\n1. No internet connection\n2. CORS issues\n3. Meshy API is down\n\nCheck browser console (F12) for details.`);
    }
}

/**
 * Reset generation form
 */
function resetGenerationForm() {
    document.getElementById('productNameInput').value = '';
    document.getElementById('imageUrlInput').value = '';
    document.getElementById('progressSection').classList.add('hidden');
    document.getElementById('uploadPreview').classList.add('hidden');
    document.getElementById('fileInput').value = '';
    uploadedImageUrl = null;
    currentTaskId = null;
}

/**
 * Start 3D model generation
 */
async function startGeneration() {
    const productName = document.getElementById('productNameInput').value.trim();
    const imageUrl = uploadedImageUrl || document.getElementById('imageUrlInput').value.trim();

    if (!productName) {
        showNotification('⚠️ Please enter a product name');
        return;
    }

    if (!imageUrl) {
        showNotification('⚠️ Please enter an image URL or upload a file');
        return;
    }

    // Validate URL format
    try {
        new URL(imageUrl);
    } catch (e) {
        showNotification('⚠️ Invalid image URL. Please check the URL or upload a file');
        return;
    }

    // Check if it's a direct image URL
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const urlLower = imageUrl.toLowerCase();
    const hasImageExtension = imageExtensions.some(ext => urlLower.includes(ext));
    
    if (!hasImageExtension) {
        showNotification('⚠️ Not a direct image URL! Must end with .jpg, .png, or .webp');
        alert('❌ INVALID IMAGE URL\n\n' +
              'You entered: ' + imageUrl + '\n\n' +
              '❌ This is a search page URL, not a direct image URL!\n\n' +
              '✅ SOLUTION:\n' +
              '1. Right-click the image in search results\n' +
              '2. Select "Copy image address" or "Open image in new tab"\n' +
              '3. Use that URL (should end in .jpg, .png, .webp)\n\n' +
              'OR\n\n' +
              '✅ Click "Upload File" tab and upload your image directly!');
        return;
    }

    // Check if it's a local file path (common mistake)
    if (imageUrl.includes('C:') || imageUrl.includes('\\') || imageUrl.startsWith('file://')) {
        showNotification('❌ Cannot use local file paths! Please:\n1. Upload the file using "Upload File" tab, OR\n2. Use a public URL (Unsplash, Imgur, etc.)');
        alert('ERROR: Local File Path Detected!\n\nYou entered: ' + imageUrl + '\n\nMeshy API needs a PUBLIC URL from the internet.\n\nPlease either:\n1. Switch to "Upload File" tab and upload your image\n2. Use a public URL like:\n   - https://images.unsplash.com/photo-...\n   - https://i.imgur.com/...\n\nLocal paths like C:\\Users\\... will NOT work!');
        return;
    }

    try {
        // Show progress section
        document.getElementById('progressSection').classList.remove('hidden');
        document.getElementById('statusText').textContent = 'Starting generation...';
        document.getElementById('progressPercent').textContent = '0%';
        document.getElementById('progressBar').style.width = '0%';

        // Start generation
        const taskId = await convertImageTo3D(imageUrl, productName);
        currentTaskId = taskId;

        document.getElementById('taskIdDisplay').textContent = `Task ID: ${taskId}`;
        
        // Wait for completion
        const modelUrl = await waitFor3DCompletion(taskId, (status) => {
            // Update progress UI
            const progress = status.progress || 0;
            document.getElementById('statusText').textContent = status.status;
            document.getElementById('progressPercent').textContent = `${progress}%`;
            document.getElementById('progressBar').style.width = `${progress}%`;
        });

        // Success
        showNotification('3D model generated successfully!');
        document.getElementById('statusText').textContent = 'Completed!';
        document.getElementById('progressPercent').textContent = '100%';
        document.getElementById('progressBar').style.width = '100%';

        // Ask user if they want to add it to the website
        setTimeout(() => {
            if (confirm(`✅ 3D Model Generated Successfully!\n\nDo you want to add "${productName}" to your website catalog?\n\nThis will create a new product with:\n- Product name: ${productName}\n- Product image\n- 3D model viewer\n- Default price: $999`)) {
                addProductToWebsite(productName, imageUrl, modelUrl);
            }
            loadRecentModels();
            resetGenerationForm();
        }, 2000);

    } catch (error) {
        console.error('Generation error:', error);
        
        // Extract detailed error message
        let errorMsg = 'Unknown error occurred';
        let errorDetails = '';
        
        if (error.message) {
            errorMsg = error.message;
            
            // Check for specific error types
            if (errorMsg.includes('NoMorePendingTasks')) {
                errorDetails = `Task creation on the free plan is no longer supported. To continue creating tasks, please upgrade your plan. You can manage your plan at https://www.meshy.ai/settings/subscription`;
            } else if (errorMsg.includes('NoMatchingRoute')) {
                errorDetails = `API endpoint not found. Please check the API configuration.`;
            } else if (errorMsg.includes('Unauthorized')) {
                errorDetails = `Invalid API key. Please check your Meshy API key at https://app.meshy.ai/settings/api-keys`;
            } else if (errorMsg.includes('Failed to fetch')) {
                errorDetails = `Cannot connect to backend server. Make sure the server is running on localhost:3000`;
            }
        }
        
        // Show notification
        showNotification('❌ 3D Generation Failed');
        
        // Update progress bar to red
        document.getElementById('statusText').textContent = '❌ 3D Generation Failed';
        document.getElementById('progressBar').style.width = '100%';
        document.getElementById('progressBar').style.backgroundColor = '#dc2626';
        document.getElementById('progressPercent').textContent = 'Error';
        
        // Show detailed error in task display
        const taskDisplay = document.getElementById('taskIdDisplay');
        if (taskDisplay) {
            taskDisplay.innerHTML = `
                <div style="color: #dc2626; font-weight: bold; font-size: 14px; margin-bottom: 10px;">
                    Error: ${errorMsg}
                </div>
                ${errorDetails ? `<div style="color: #666; font-size: 13px; line-height: 1.6; margin-bottom: 15px;">
                    ${errorDetails}
                </div>` : ''}
                <div style="color: #666; font-size: 12px; margin-top: 10px;">
                    <strong>Possible Solutions:</strong><br>
                    1. Check your internet connection<br>
                    2. Make sure the image URL is valid and accessible<br>
                    3. Try using the "Upload File" tab instead<br>
                    4. Check browser console (F12) for detailed error<br>
                    5. Make sure backend server is running
                </div>
            `;
        }
        
        // Show formatted alert matching the screenshot style
        const alertMsg = `❌ 3D Generation Failed\n\nError: ${errorMsg}${errorDetails ? '\n\n' + errorDetails : ''}\n\nPossible Solutions:\n1. Check your internet connection\n2. Make sure the image URL is valid and accessible\n3. Try using the "Upload File" tab instead\n4. Check browser console (F12) for detailed error\n5. Make sure backend server is running`;
        alert(alertMsg);
    }
}

/**
 * Load recent 3D models
 */
async function loadRecentModels() {
    try {
        const models = await listAllModels();
        const modelsList = document.getElementById('modelsList');
        
        if (models && models.length > 0) {
            modelsList.innerHTML = models.map(model => `
                <div class="bg-white p-4 rounded-lg border border-accent flex items-center justify-between">
                    <div class="flex-1">
                        <h4 class="font-semibold text-primary">${model.name || 'Unnamed Model'}</h4>
                        <p class="text-xs text-gray-500">Task ID: ${model.id}</p>
                        <p class="text-xs text-gray-500">Status: ${model.status}</p>
                        <p class="text-xs text-gray-500">Created: ${new Date(model.created_at * 1000).toLocaleDateString()}</p>
                    </div>
                    <div class="flex gap-2">
                        ${model.model_urls && model.model_urls.glb ? `
                            <button onclick="downloadModelDirect('${model.model_urls.glb}')" 
                                    class="px-3 py-2 bg-secondary text-white text-sm hover:bg-secondary/90 transition-colors">
                                <i class="fas fa-download mr-1"></i>Download
                            </button>
                            <button onclick="previewModel('${model.model_urls.glb}')" 
                                    class="px-3 py-2 bg-primary text-white text-sm hover:bg-primary/90 transition-colors">
                                <i class="fas fa-eye mr-1"></i>Preview
                            </button>
                        ` : `
                            <span class="text-xs text-gray-500">Processing...</span>
                        `}
                    </div>
                </div>
            `).join('');
        } else {
            modelsList.innerHTML = '<p class="text-gray-500 text-center py-8">No models generated yet</p>';
        }
    } catch (error) {
        console.error('Error loading models:', error);
        document.getElementById('modelsList').innerHTML = '<p class="text-red-500 text-center py-8">Failed to load models</p>';
    }
}

/**
 * Download 3D model directly from URL
 */
async function downloadModelDirect(modelUrl) {
    try {
        showNotification('Downloading model...');
        
        const response = await fetch(modelUrl);
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `model_${Date.now()}.glb`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showNotification('Model downloaded successfully!');
    } catch (error) {
        console.error('Download error:', error);
        showNotification('Failed to download model');
    }
}

/**
 * Preview 3D model
 */
function previewModel(modelUrl) {
    // Find a product to use as template
    const product = products[0]; // Use first product as template
    
    // Temporarily set the model URL
    const originalModel = product.model3D;
    product.model3D = modelUrl;
    
    // Open 3D viewer
    open3DViewer(product);
    
    // Restore original model after viewer opens
    setTimeout(() => {
        product.model3D = originalModel;
    }, 1000);
}

/**
 * Add generated 3D model as a new product to the website
 */
function addProductToWebsite(productName, imageUrl, model3DUrl) {
    try {
        // Generate new product ID
        const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
        
        // Determine category based on name
        let category = 'living-room'; // Default
        const nameLower = productName.toLowerCase();
        if (nameLower.includes('bed') || nameLower.includes('nightstand') || nameLower.includes('dresser')) {
            category = 'bedroom';
        } else if (nameLower.includes('desk') || nameLower.includes('chair') || nameLower.includes('office')) {
            category = 'office';
        } else if (nameLower.includes('dining') || nameLower.includes('table')) {
            category = 'dining';
        }
        
        // Create new product object
        const newProduct = {
            id: newId,
            name: productName,
            price: 999, // Default price
            category: category,
            image: imageUrl,
            model3D: model3DUrl,
            description: `AI-generated 3D model of ${productName}. High-quality furniture piece with realistic rendering and interactive 3D viewing.`,
            rating: 4.5,
            reviews: 0,
            badge: 'New'
        };
        
        // Add to products array at the beginning
        products.unshift(newProduct);
        
        // Save to localStorage
        saveCustomProducts();
        
        // Re-render products
        renderProducts();
        
        // Show success notification
        showNotification(`✅ "${productName}" added to your catalog!`);
        
        // Close admin modal
        closeAdminModal();
        
        // Scroll to top to see new product
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        // Highlight the new product briefly
        setTimeout(() => {
            const productCard = document.querySelector(`[data-product-id="${newId}"]`);
            if (productCard) {
                productCard.style.animation = 'pulse 1s ease-in-out 3';
                productCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 500);
        
    } catch (error) {
        console.error('Error adding product to website:', error);
        showNotification('Error adding product: ' + error.message);
    }
}

// Load custom products from localStorage
function loadCustomProducts() {
    const savedProducts = localStorage.getItem('customProducts');
    if (savedProducts) {
        try {
            const customProducts = JSON.parse(savedProducts);
            // Merge custom products with default products (custom first)
            products = [...customProducts, ...products];
            console.log(`✅ Loaded ${customProducts.length} custom products from localStorage`);
        } catch (e) {
            console.error('Error loading custom products:', e);
        }
    }
}

// Save custom products to localStorage
function saveCustomProducts() {
    const customProducts = products.filter(p => p.badge === 'New');
    localStorage.setItem('customProducts', JSON.stringify(customProducts));
    console.log(`💾 Saved ${customProducts.length} custom products to localStorage`);
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Load custom products from localStorage
    loadCustomProducts();
    
    // Initial render
    renderProducts();
    updateCartUI();
    updateWishlistUI();
    updateUserUI();

    // Admin modal
    const adminBtn = document.getElementById('adminBtn');
    const adminModal = document.getElementById('adminModal');

    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminModal);
    }

    if (adminModal) {
        adminModal.addEventListener('click', (e) => {
            if (e.target === adminModal) {
                closeAdminModal();
            }
        });
    }

    // Cart modal
    const cartBtn = document.getElementById('cartBtn');
    const cartModal = document.getElementById('cartModal');
    const closeCart = document.getElementById('closeCart');

    if (cartBtn) {
        cartBtn.addEventListener('click', () => {
            cartModal.classList.remove('hidden');
            cartModal.classList.add('flex');
        });
    }

    if (closeCart) {
        closeCart.addEventListener('click', () => {
            cartModal.classList.add('hidden');
            cartModal.classList.remove('flex');
        });
    }

    // Close cart on outside click
    if (cartModal) {
        cartModal.addEventListener('click', (e) => {
            if (e.target === cartModal) {
                cartModal.classList.add('hidden');
                cartModal.classList.remove('flex');
            }
        });
    }

    // Wishlist modal
    const wishlistBtn = document.getElementById('wishlistBtn');
    const wishlistModal = document.getElementById('wishlistModal');
    const closeWishlist = document.getElementById('closeWishlist');

    if (wishlistBtn) {
        wishlistBtn.addEventListener('click', () => {
            renderWishlistModal();
            wishlistModal.classList.remove('hidden');
            wishlistModal.classList.add('flex');
        });
    }

    if (closeWishlist) {
        closeWishlist.addEventListener('click', () => {
            wishlistModal.classList.add('hidden');
            wishlistModal.classList.remove('flex');
        });
    }

    // Close wishlist on outside click
    if (wishlistModal) {
        wishlistModal.addEventListener('click', (e) => {
            if (e.target === wishlistModal) {
                wishlistModal.classList.add('hidden');
                wishlistModal.classList.remove('flex');
            }
        });
    }

    // 3D Viewer modal close button
    const close3DViewerBtn = document.getElementById('close3DViewer');
    if (close3DViewerBtn) {
        close3DViewerBtn.addEventListener('click', close3DViewer);
    }

    // Close 3D viewer on outside click
    const viewer3DModal = document.getElementById('viewer3DModal');
    if (viewer3DModal) {
        viewer3DModal.addEventListener('click', (e) => {
            if (e.target === viewer3DModal) {
                close3DViewer();
            }
        });
    }

    // Add to cart from 3D viewer
    const add3DToCartBtn = document.getElementById('add3DToCart');
    if (add3DToCartBtn) {
        add3DToCartBtn.addEventListener('click', () => {
            if (currentProduct) {
                addToCart(currentProduct.id);
                close3DViewer();
            }
        });
    }

    // Filters
    const categoryFilter = document.getElementById('categoryFilter');
    const priceFilter = document.getElementById('priceFilter');
    const sortFilter = document.getElementById('sortFilter');

    if (categoryFilter) categoryFilter.addEventListener('change', filterProducts);
    if (priceFilter) priceFilter.addEventListener('change', filterProducts);
    if (sortFilter) sortFilter.addEventListener('change', filterProducts);

    // Search
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterProducts();
        });
    }

    // Header "View All" button functionality
    const viewAllButtons = document.querySelectorAll('a[href="#products"]');
    viewAllButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Reset all filters
            const categoryFilter = document.getElementById('categoryFilter');
            const priceFilter = document.getElementById('priceFilter');
            const sortFilter = document.getElementById('sortFilter');
            const searchInput = document.getElementById('searchInput');
            
            if (categoryFilter) categoryFilter.value = 'all';
            if (priceFilter) priceFilter.value = 'all';
            if (sortFilter) sortFilter.value = 'featured';
            if (searchInput) searchInput.value = '';
            
            // Re-render all products
            renderProducts(products);
            
            // Scroll to products
            const productsSection = document.getElementById('products');
            if (productsSection) {
                productsSection.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }
            
            showNotification('Showing all products');
        });
    });

    // Category cards click
    const categoryCards = document.querySelectorAll('[data-category]');
    categoryCards.forEach(card => {
        card.addEventListener('click', () => {
            const category = card.getAttribute('data-category');
            const categoryFilter = document.getElementById('categoryFilter');
            
            if (categoryFilter) {
                // Set the category filter
                categoryFilter.value = category;
                
                // Apply filter
                filterProducts();
                
                // Smooth scroll to products section
                const productsSection = document.getElementById('products');
                if (productsSection) {
                    productsSection.scrollIntoView({ 
                        behavior: 'smooth', 
                        block: 'start' 
                    });
                }
                
                // Show notification
                const categoryName = category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
                showNotification(`Showing ${categoryName} products`);
            }
        });
    });

    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            alert('Mobile menu - Coming soon!');
        });
    }

    // User button click
    const userBtn = document.getElementById('userBtn');
    if (userBtn) {
        userBtn.addEventListener('click', () => {
            if (currentUser) {
                showUserProfile();
            } else {
                showLoginModal();
            }
        });
    }

    // User modal close
    const closeUserModal_btn = document.getElementById('closeUserModal');
    if (closeUserModal_btn) {
        closeUserModal_btn.addEventListener('click', closeUserModal);
    }

    // Close user modal on outside click
    const userModal = document.getElementById('userModal');
    if (userModal) {
        userModal.addEventListener('click', (e) => {
            if (e.target === userModal) {
                closeUserModal();
            }
        });
    }

    // Login form submit
    const loginFormElement = document.getElementById('loginForm');
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', handleLogin);
    }

    // Register form submit
    const registerFormElement = document.getElementById('registerForm');
    if (registerFormElement) {
        registerFormElement.addEventListener('submit', handleRegister);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // ESC to close modals
        if (e.key === 'Escape') {
            close3DViewer();
            closeUserModal();
            if (cartModal) {
                cartModal.classList.add('hidden');
                cartModal.classList.remove('flex');
            }
            if (wishlistModal) {
                wishlistModal.classList.add('hidden');
                wishlistModal.classList.remove('flex');
            }
        }
    });
});

// ============================================
// PARTNER BRANDS PRODUCTS
// ============================================
const partnerProducts = [
    // IKEA Products
    {
        id: 'partner-1',
        name: 'KIVIK Sofa',
        price: 449,
        category: 'Living Room',
        brand: 'ikea',
        brandName: 'IKEA',
        image: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=600&fit=crop',
        description: 'Spacious sofa with deep seat cushions and soft comfort',
        rating: 4.5,
        reviews: 1247,
        url: 'https://www.ikea.com'
    },
    {
        id: 'partner-2',
        name: 'HEMNES Bookcase',
        price: 189,
        category: 'Storage',
        brand: 'ikea',
        brandName: 'IKEA',
        image: 'https://images.unsplash.com/photo-1594620302200-9a762244a156?w=800&h=600&fit=crop',
        description: 'Solid wood bookcase with adjustable shelves',
        rating: 4.6,
        reviews: 856,
        url: 'https://www.ikea.com'
    },
    {
        id: 'partner-3',
        name: 'MALM Bed Frame',
        price: 229,
        category: 'Bedroom',
        brand: 'ikea',
        brandName: 'IKEA',
        image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800&h=600&fit=crop',
        description: 'Modern bed frame with adjustable bed sides',
        rating: 4.7,
        reviews: 2134,
        url: 'https://www.ikea.com'
    },
    // Wayfair Products
    {
        id: 'partner-4',
        name: 'Madison Sectional',
        price: 1299,
        category: 'Living Room',
        brand: 'wayfair',
        brandName: 'Wayfair',
        image: 'https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800&h=600&fit=crop',
        description: 'Luxury L-shaped sectional with premium fabric',
        rating: 4.8,
        reviews: 534,
        url: 'https://www.wayfair.com'
    },
    {
        id: 'partner-5',
        name: 'Riverside Dining Set',
        price: 899,
        category: 'Dining Room',
        brand: 'wayfair',
        brandName: 'Wayfair',
        image: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=800&h=600&fit=crop',
        description: 'Elegant 7-piece dining set with extending table',
        rating: 4.7,
        reviews: 342,
        url: 'https://www.wayfair.com'
    },
    // West Elm Products
    {
        id: 'partner-6',
        name: 'Mid-Century Console',
        price: 699,
        category: 'Storage',
        brand: 'west-elm',
        brandName: 'West Elm',
        image: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=800&h=600&fit=crop',
        description: 'Iconic mid-century design with acorn legs',
        rating: 4.9,
        reviews: 287,
        url: 'https://www.westelm.com'
    },
    {
        id: 'partner-7',
        name: 'Harmony Lounge Chair',
        price: 549,
        category: 'Living Room',
        brand: 'west-elm',
        brandName: 'West Elm',
        image: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=800&h=600&fit=crop',
        description: 'Contemporary accent chair with curved silhouette',
        rating: 4.6,
        reviews: 198,
        url: 'https://www.westelm.com'
    },
    // CB2 Products
    {
        id: 'partner-8',
        name: 'District Carbon Desk',
        price: 799,
        category: 'Office',
        brand: 'cb2',
        brandName: 'CB2',
        image: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=800&h=600&fit=crop',
        description: 'Industrial-modern desk with steel frame',
        rating: 4.8,
        reviews: 156,
        url: 'https://www.cb2.com'
    },
    {
        id: 'partner-9',
        name: 'Flex Modular Sofa',
        price: 1499,
        category: 'Living Room',
        brand: 'cb2',
        brandName: 'CB2',
        image: 'https://images.unsplash.com/photo-1540574163026-643ea20ade25?w=800&h=600&fit=crop',
        description: 'Configurable modular sofa system',
        rating: 4.7,
        reviews: 423,
        url: 'https://www.cb2.com'
    },
    // Pottery Barn Products
    {
        id: 'partner-10',
        name: 'Chesterfield Sofa',
        price: 2199,
        category: 'Living Room',
        brand: 'pottery-barn',
        brandName: 'Pottery Barn',
        image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&h=600&fit=crop',
        description: 'Classic tufted leather Chesterfield design',
        rating: 4.9,
        reviews: 678,
        url: 'https://www.potterybarn.com'
    },
    {
        id: 'partner-11',
        name: 'Farmhouse Dining Table',
        price: 1299,
        category: 'Dining Room',
        brand: 'pottery-barn',
        brandName: 'Pottery Barn',
        image: 'https://images.unsplash.com/photo-1615066390971-03e4e1c36ddf?w=800&h=600&fit=crop',
        description: 'Rustic solid wood farmhouse table',
        rating: 4.8,
        reviews: 534,
        url: 'https://www.potterybarn.com'
    },
    {
        id: 'partner-12',
        name: 'Upholstered Bed',
        price: 1599,
        category: 'Bedroom',
        brand: 'pottery-barn',
        brandName: 'Pottery Barn',
        image: 'https://images.unsplash.com/photo-1505693314120-0d443867891c?w=800&h=600&fit=crop',
        description: 'Luxurious upholstered bed with tufted headboard',
        rating: 4.9,
        reviews: 892,
        url: 'https://www.potterybarn.com'
    }
];

// Render partner products
function renderPartnerProducts(filter = 'all') {
    const grid = document.getElementById('partnerProductsGrid');
    if (!grid) return;

    const filteredProducts = filter === 'all' 
        ? partnerProducts 
        : partnerProducts.filter(p => p.brand === filter);

    grid.innerHTML = filteredProducts.map(product => `
        <div class="product-card bg-white rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-500 group">
            <div class="relative overflow-hidden">
                <img src="${product.image}" 
                     alt="${product.name}" 
                     class="w-full h-72 object-cover transform group-hover:scale-110 transition-transform duration-700"
                     onerror="this.src='https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=800&h=600&fit=crop'">
                <div class="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg">
                    <span class="text-primary font-bold text-sm">${product.brandName}</span>
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-primary/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
            <div class="p-6">
                <div class="flex items-center justify-between mb-3">
                    <span class="text-xs font-body font-semibold text-luxury/60 uppercase tracking-wider">${product.category}</span>
                    <div class="flex items-center gap-1">
                        <i class="fas fa-star text-secondary text-xs"></i>
                        <span class="text-sm font-semibold text-primary">${product.rating}</span>
                        <span class="text-xs text-luxury/60">(${product.reviews})</span>
                    </div>
                </div>
                <h3 class="text-xl font-bold text-primary mb-2 group-hover:text-secondary transition-colors">${product.name}</h3>
                <p class="text-luxury/70 font-body text-sm mb-4 line-clamp-2">${product.description}</p>
                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-3xl font-bold text-secondary">$${product.price}</span>
                        <span class="text-xs text-luxury/60 font-body">฿${(product.price * EXCHANGE_RATE).toLocaleString()}</span>
                    </div>
                    <a href="${product.url}" 
                       target="_blank"
                       class="px-6 py-3 bg-primary hover:bg-secondary text-white rounded-full font-body font-semibold text-sm uppercase tracking-wider transition-all duration-300 hover:shadow-lg transform hover:-translate-y-1">
                        View <i class="fas fa-external-link-alt ml-2 text-xs"></i>
                    </a>
                </div>
            </div>
        </div>
    `).join('');
}

// Filter partner products by brand
function filterPartnerProducts(brand) {
    renderPartnerProducts(brand);
    
    // Update active button state
    document.querySelectorAll('.partner-filter-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-primary', 'text-white');
        btn.classList.add('bg-white', 'text-primary', 'border-2', 'border-primary/20');
    });
    
    event.target.classList.add('active', 'bg-primary', 'text-white');
    event.target.classList.remove('bg-white', 'text-primary', 'border-2', 'border-primary/20');
}

// Initialize partner products on page load
document.addEventListener('DOMContentLoaded', () => {
    renderPartnerProducts();
});

// ============================================
// SMOOTH SCROLL FUNCTIONS
// ============================================
function scrollToProducts() {
    const productsSection = document.getElementById('products');
    if (productsSection) {
        productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function scrollToRooms() {
    const roomsSection = document.getElementById('rooms');
    if (roomsSection) {
        roomsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ============================================
// SUBSCRIPTION PLAN FUNCTIONS
// ============================================
function selectPlan(planType) {
    // Check if user is logged in
    if (!isLoggedIn) {
        showLoginModal();
        alert('Please login to subscribe to a plan');
        return;
    }

    const plans = {
        freemium: {
            name: 'Freemium Plan',
            price: 0,
            priceThb: 0,
            features: ['Augmented Reality (AR) Access', 'Comprehensive Tutorial Guide', 'Advertising Integration', 'Restricted Color Palette', 'No AI Features', 'Free 3D objects Functionality', 'Single-User Editing Constraint']
        },
        premium: {
            name: 'Premium Plan',
            price: 29,
            priceThb: 1015,
            features: ['Augmented Reality (AR) Access', 'Comprehensive Tutorial Guide', 'Ad-Free Experience', 'Comprehensive Color Palette', 'AI-Powered Assistance', '3D Object Scanning Support', 'Collaborative Editing']
        },
        enterprise: {
            name: 'Enterprise Plan',
            price: 'Custom',
            priceThb: 'Custom',
            features: ['All Premium Features', 'Unlimited Team Members', 'White-Label Solutions', 'API Access & Integration', 'Custom Training Sessions', '24/7 Priority Support', 'Service Level Agreement (SLA)', 'Dedicated Infrastructure']
        }
    };

    const selectedPlan = plans[planType];
    
    // For enterprise plan, show contact message
    if (planType === 'enterprise') {
        alert('🏢 Thank you for your interest in our Enterprise Plan!\n\nOur sales team will contact you shortly to discuss custom pricing and implementation.\n\nPlease contact: enterprise@stellarion.com\nOr call: +1 (555) 123-4567');
        return;
    }

    // Store subscription in currentUser
    currentUser.subscription = {
        plan: planType,
        planName: selectedPlan.name,
        price: selectedPlan.price,
        priceThb: selectedPlan.priceThb,
        features: selectedPlan.features,
        startDate: new Date().toISOString(),
        status: 'active'
    };

    // Save to localStorage
    localStorage.setItem('currentUser', JSON.stringify(currentUser));

    // Show success message
    if (planType === 'freemium') {
        alert(`🎉 Welcome to Stellarion Freemium!\n\nYou now have access to all free features including AR visualization and 3D product previews.\n\nUpgrade anytime to unlock premium features!`);
    } else {
        alert(`🎉 Congratulations! You've successfully subscribed to the ${selectedPlan.name}!\n\nYou now have access to all premium features.\n\nThank you for becoming a premium member!`);
    }

    // Update UI to show subscription status
    updateUserProfile();
}

function toggleFAQ(faqNumber) {
    const faqContent = document.getElementById(`faq-${faqNumber}`);
    const faqIcon = document.querySelector(`.faq-icon-${faqNumber}`);
    
    if (faqContent && faqIcon) {
        if (faqContent.classList.contains('hidden')) {
            faqContent.classList.remove('hidden');
            faqIcon.style.transform = 'rotate(180deg)';
        } else {
            faqContent.classList.add('hidden');
            faqIcon.style.transform = 'rotate(0deg)';
        }
    }
}

// ============================================
// VIRTUAL ROOM DESIGNER FUNCTIONS
// ============================================
let currentRoom = null;
let roomFurniture = [];
let selectedItem = null;
let roomScene = null;
let roomCamera = null;
let roomRenderer = null;
let roomControls = null;
let roomObjects = [];
// Path to the FBX/3D model currently associated with the selected room template
let currentRoomModelPath = null;
// Transform controls and selection
let roomRaycaster = null;
let roomPointer = new THREE.Vector2();
let transformControls = null;
let selectedObject = null;

const roomTemplates = {
    'living-room': {
        name: 'Living Room',
        dimensions: { width: 20, length: 25, height: 10 },
        floor: '#f5f0e8',
        walls: '#ffffff'
    },
    'bedroom': {
        name: 'Bedroom',
        dimensions: { width: 15, length: 18, height: 9 },
        floor: '#e8d5c4',
        walls: '#f8f8f8'
    },
    'dining-room': {
        name: 'Dining Room',
        dimensions: { width: 16, length: 20, height: 10 },
        floor: '#d4c4b0',
        walls: '#fafafa'
    }
};

const roomModels = {
    "living-room": "./image/Rooms/Room1.fbx",
    "bedroom": "./image/Rooms/Room2.fbx",
    "kitchen": "./image/Rooms/Room3.fbx",
    "bathroom": "./image/Rooms/Room4.fbx"
};

const designerFurnitureLibrary = [
    { id: 'df1', name: 'Modern Sofa', category: 'seating', price: 899, thumbnail: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=200' },
    { id: 'df2', name: 'Accent Chair', category: 'seating', price: 399, thumbnail: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=200' },
    { id: 'df3', name: 'Coffee Table', category: 'tables', price: 299, thumbnail: 'https://images.unsplash.com/photo-1532372320572-cda25653a26d?w=200' },
    { id: 'df4', name: 'Dining Table', category: 'tables', price: 799, thumbnail: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?w=200' },
    { id: 'df5', name: 'Bookshelf', category: 'storage', price: 449, thumbnail: 'https://images.unsplash.com/photo-1594620302200-9a762244a156?w=200' },
    { id: 'df6', name: 'TV Console', category: 'storage', price: 549, thumbnail: 'https://images.unsplash.com/photo-1616627781431-23e8f8619d96?w=200' },
    { id: 'df7', name: 'Floor Lamp', category: 'lighting', price: 179, thumbnail: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=200' },
    { id: 'df8', name: 'Table Lamp', category: 'lighting', price: 89, thumbnail: 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=200' },
    { id: 'df9', name: 'Wall Art', category: 'decor', price: 129, thumbnail: 'https://images.unsplash.com/photo-1582042945925-9b71c3c63a0e?w=200' },
    { id: 'df10', name: 'Plant Pot', category: 'decor', price: 59, thumbnail: 'https://images.unsplash.com/photo-1591958911259-bee2173bdccc?w=200' }
];

function openRoomDesigner() {
    const modal = document.getElementById('roomDesignerModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        loadDesignerFurniture('all');
        
        // If a room is already selected, initialize it
        if (currentRoom) {
            setTimeout(() => {
                initializeRoom3D();
            }, 200);
        }
    }
}

function closeRoomDesigner() {
    const modal = document.getElementById('roomDesignerModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        
        // Clean up Three.js resources
        window.removeEventListener('resize', onRoomResize);
        // Remove pointer & keyboard handlers
        try { roomRenderer.domElement.removeEventListener('pointerdown', onRoomPointerDown); } catch (e) {}
        try { window.removeEventListener('keydown', onRoomKeyDown); } catch (e) {}

        if (transformControls) {
            try { transformControls.detach(); } catch (e) {}
            try { roomScene.remove(transformControls); } catch (e) {}
            transformControls = null;
        }

        if (roomRenderer) {
            roomRenderer.dispose();
            roomRenderer.domElement?.remove();
            roomRenderer = null;
        }
        if (roomScene) {
            // dispose geometries/materials
            roomScene.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose?.();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.());
                    else obj.material.dispose?.();
                }
            });
            roomScene.clear();
            roomScene = null;
        }
        roomCamera = null;
        roomControls = null;
        roomObjects = [];
        selectedObject = null;
        currentRoom = null;
    }
}

function selectRoomTemplate(templateId, el) {
    // Allow passing the clicked element so we can read a `data-model` override
    const clickedEl = el || null;
    // Prefer explicit data-model on the element, otherwise fall back to mapping
    const modelFromEl = clickedEl?.dataset?.model || null;
    currentRoomModelPath = modelFromEl || roomModels[templateId] || null;

    currentRoom = roomTemplates[templateId];
    console.log('selectRoomTemplate:', templateId, 'modelPath:', currentRoomModelPath);
    if (currentRoom) {
        document.getElementById('currentRoomName').textContent = currentRoom.name;
        openRoomDesigner();
        // Give modal time to render before initializing 3D
        setTimeout(() => {
            initializeRoom3D(templateId);
        }, 200);
    }
}

function initializeRoom3D(templateId) {
    console.log("Selected template:", templateId);

    const canvasContainer = document.getElementById('roomCanvas');
    if (!canvasContainer) return console.error('Canvas container not found');

    // Hide placeholder overlay instead of removing innerHTML
    const placeholder = canvasContainer.querySelector('div');
    if (placeholder) placeholder.style.display = 'none';

    roomObjects = [];

    // --- Scene ---
    roomScene = new THREE.Scene();
    roomScene.background = new THREE.Color(0xffffff);

    // --- Camera ---
    const width = canvasContainer.clientWidth || window.innerWidth;
    const height = canvasContainer.clientHeight || window.innerHeight;
    roomCamera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    roomCamera.position.set(10, 10, 10);
    roomCamera.lookAt(0, 0, 0);

    // --- Renderer ---
    if (!roomRenderer) {
        roomRenderer = new THREE.WebGLRenderer({ antialias: true });
        // Use alpha=false so background color shows as solid white
        roomRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        roomRenderer.setSize(width, height);
        roomRenderer.setPixelRatio(window.devicePixelRatio);
        roomRenderer.shadowMap.enabled = true;
        roomRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
        // Ensure clear color matches the scene background
        roomRenderer.setClearColor(0xffffff, 1);
        canvasContainer.appendChild(roomRenderer.domElement);
    } else {
        roomRenderer.setSize(width, height);
    }

    // --- Controls ---
    roomControls = new THREE.OrbitControls(roomCamera, roomRenderer.domElement);
    roomControls.enableDamping = true;
    roomControls.dampingFactor = 0.05;
    roomControls.minDistance = 5;
    roomControls.maxDistance = 50;
    roomControls.maxPolarAngle = Math.PI / 2 - 0.05;

    // --- Lights ---
    addRoomLights();

        // --- Raycaster & TransformControls ---
        roomRaycaster = new THREE.Raycaster();
        roomPointer = new THREE.Vector2();

        if (typeof THREE.TransformControls !== 'undefined') {
            transformControls = new THREE.TransformControls(roomCamera, roomRenderer.domElement);
            transformControls.addEventListener('change', () => {
                // render on transform
                roomRenderer.render(roomScene, roomCamera);
            });
            transformControls.addEventListener('dragging-changed', function (event) {
                roomControls.enabled = !event.value;
            });
            roomScene.add(transformControls);
        } else {
            console.warn('TransformControls not found. Gizmos will be disabled.');
        }

        // Pointer events for selection
        roomRenderer.domElement.addEventListener('pointerdown', onRoomPointerDown);
        // Keyboard shortcuts
        window.addEventListener('keydown', onRoomKeyDown);

    // --- Room geometry ---
    // NOTE: procedural room generation (createRoom3D) removed.
    // The designer now loads real room geometry from FBX files stored in `image/Rooms`.
    if (templateId) {
        currentRoom = roomTemplates[templateId] || null;
        // Do not create procedural floor/walls here; FBX should contain the room geometry.
    }

    // --- Load FBX room model if available ---
    if (templateId && currentRoomModelPath) {
        loadRoomModel(templateId, currentRoomModelPath);
    }

    window.addEventListener('resize', onRoomResize);

    animateRoom();
}


/**
 * Display room template parameters (name, dimensions, colors, model path).
 * Inserts or updates a small overlay in the room designer area.
 * @param {string|null} templateId
 */
function showRoomParameters(templateId) {
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    let tpl = null;
    if (templateId && roomTemplates[templateId]) tpl = roomTemplates[templateId];
    else if (currentRoom) tpl = currentRoom;

    // Create overlay container if missing
    let overlay = document.getElementById('roomParams');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'roomParams';
        overlay.style.position = 'absolute';
        overlay.style.right = '12px';
        overlay.style.top = '12px';
        overlay.style.background = 'rgba(255,255,255,0.9)';
        overlay.style.padding = '8px 12px';
        overlay.style.borderRadius = '8px';
        overlay.style.boxShadow = '0 6px 18px rgba(0,0,0,0.12)';
        overlay.style.fontSize = '13px';
        overlay.style.color = '#1f2937';
        overlay.style.zIndex = '50';
        canvas.appendChild(overlay);
    }

    if (!tpl) {
        overlay.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">Room Template</div><div style="color:#6b7280;">No template selected</div>`;
        return;
    }

    // Prefer the explicit currentRoomModelPath (set when user clicked a preview), otherwise fall back to mapping
    const modelPath = currentRoomModelPath || (templateId && roomModels[templateId]) || '';
    overlay.innerHTML = `
        <div style="font-weight:700;margin-bottom:6px;">${tpl.name || 'Room'}</div>
        <div style="color:#374151;margin-bottom:6px;"><strong>Dimensions:</strong> ${tpl.dimensions.width} x ${tpl.dimensions.length} x ${tpl.dimensions.height} (W×L×H)</div>
        <div style="color:#374151;margin-bottom:6px;"><strong>Floor:</strong> <span style="display:inline-block;width:12px;height:12px;background:${tpl.floor};border-radius:2px;vertical-align:middle;margin-left:6px;border:1px solid #ddd"></span></div>
        <div style="color:#374151;margin-bottom:6px;"><strong>Walls:</strong> <span style="display:inline-block;width:12px;height:12px;background:${tpl.walls};border-radius:2px;vertical-align:middle;margin-left:6px;border:1px solid #ddd"></span></div>
        <div style="color:#374151;"><strong>Model:</strong> ${modelPath || 'N/A'}</div>
    `;
}

function loadRoomModel(templateId, modelPathOverride) {
    const modelPath = modelPathOverride || roomModels[templateId];
    console.log('Attempting loadRoomModel, path =', modelPath);
    if (!modelPath) return console.warn("No FBX found for template:", templateId, '(no mapping or override)');

    // Ensure FBXLoader is available
    if (typeof THREE.FBXLoader === 'undefined') {
        console.error('THREE.FBXLoader is not available. Make sure examples/js/loaders/FBXLoader.js is included.');
        return;
    }

    const loader = new THREE.FBXLoader();
loader.load(
    modelPath,
    function (object) {
        // auto-scale
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const scale = 6 / maxDim;
        object.scale.setScalar(scale);

        // re-center
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center);

        object.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                child.userData.selectable = true;
            }
        });

            roomScene.add(object);
            console.log("FBX loaded:", modelPath);

            // After adding model, frame it: center camera and adjust distance
            try {
                frameModel(object);
            } catch (err) {
                console.warn('frameModel failed:', err);
            }
    },
    undefined,
    function (err) {
        console.error("FBX Load Error:", err);
    }
);

}

function onRoomResize() {
    if (!roomCamera || !roomRenderer || !document.getElementById('roomCanvas')) return;
    
    const canvas = document.getElementById('roomCanvas');
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    roomCamera.aspect = width / height;
    roomCamera.updateProjectionMatrix();
    roomRenderer.setSize(width, height);
}

/**
 * Frame an object in the room camera by computing its bounding box and setting camera position/controls target
 * @param {THREE.Object3D} object
 */
function frameModel(object) {
    if (!object || !roomCamera || !roomControls) return;

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Determine a distance that fits the object in view
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = roomCamera.fov * (Math.PI / 180);
    let distance = Math.abs(maxDim / Math.sin(fov / 2));
    if (!isFinite(distance) || distance === 0) distance = maxDim * 2 + 10;

    // Position camera along a diagonal so users see depth
    const offset = new THREE.Vector3(distance, distance * 0.6, distance);
    roomCamera.position.copy(center.clone().add(offset));
    roomCamera.lookAt(center);

    // Update orbit controls target
    roomControls.target.copy(center);
    roomControls.update();
}

function createRoom3D() {
    const { width, length, height } = currentRoom.dimensions;

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(width, length);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color(currentRoom.floor),
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    roomScene.add(floor);

    // Walls
    const wallMaterial = new THREE.MeshStandardMaterial({ 
        color: new THREE.Color(currentRoom.walls),
        side: THREE.DoubleSide,
        roughness: 0.9
    });

    // Back wall
    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        wallMaterial
    );
    backWall.position.set(0, height/2, -length/2);
    backWall.receiveShadow = true;
    roomScene.add(backWall);

    // Left wall
    const leftWall = new THREE.Mesh(
        new THREE.PlaneGeometry(length, height),
        wallMaterial
    );
    leftWall.position.set(-width/2, height/2, 0);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.receiveShadow = true;
    roomScene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(
        new THREE.PlaneGeometry(length, height),
        wallMaterial
    );
    rightWall.position.set(width/2, height/2, 0);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.receiveShadow = true;
    roomScene.add(rightWall);

    // Add subtle grid helper
    const gridHelper = new THREE.GridHelper(Math.max(width, length), 20, 0xd4a960, 0xe8dcc8);
    gridHelper.material.opacity = 0.3;
    gridHelper.material.transparent = true;
    roomScene.add(gridHelper);
}

function addRoomLights() {
    // Soft ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    roomScene.add(ambientLight);

    // Main directional light (soft sunlight)
    const sunLight = new THREE.DirectionalLight(0xfff8e7, 0.5);
    sunLight.position.set(10, 20, 10);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    roomScene.add(sunLight);

    // Soft fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.2);
    fillLight.position.set(-10, 10, -10);
    roomScene.add(fillLight);

    // Subtle point light for depth
    const pointLight = new THREE.PointLight(0xffe4c4, 0.3, 30);
    pointLight.position.set(0, 8, 0);
    roomScene.add(pointLight);
}

function setupRoomDragDrop() {
    const canvas = document.getElementById('roomCanvas');
    if (!canvas) return;

    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const furnitureId = e.dataTransfer.getData('furnitureId');
        if (furnitureId) {
            addFurnitureToRoom(furnitureId, e.clientX, e.clientY);
        }
    });
}

function addFurnitureToRoom(furnitureId, clientX, clientY) {
    const furniture = designerFurnitureLibrary.find(f => f.id === furnitureId);
    if (!furniture) return;

    // Get 3D position from screen coordinates
    const canvas = document.getElementById('roomCanvas');
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast to find floor position
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), roomCamera);
    
    const floor = roomScene.children.find(obj => obj.geometry?.type === 'PlaneGeometry' && obj.rotation.x < 0);
    let position = null;

    if (floor) {
        const intersects = raycaster.intersectObject(floor);
        if (intersects.length === 0) return;
        position = intersects[0].point;
    } else {
        // No procedural floor available (we rely on FBX room).
        // Fallback: intersect the ray with the world XZ plane at y=0 so furniture can still be placed.
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const hitPoint = new THREE.Vector3();
        const intersectsPlane = raycaster.ray.intersectPlane(groundPlane, hitPoint);
        if (!intersectsPlane) return;
        position = hitPoint;
    }

    // Create furniture placeholder (box for now)
    let furnitureObj;
    const material = new THREE.MeshStandardMaterial({ 
        color: Math.random() * 0xffffff,
        roughness: 0.6,
        metalness: 0.3
    });

    // Different sizes based on category
    switch(furniture.category) {
        case 'seating':
            furnitureObj = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2), material);
            break;
        case 'tables':
            furnitureObj = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), material);
            break;
        case 'storage':
            furnitureObj = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), material);
            break;
        case 'lighting':
            furnitureObj = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 4), material);
            break;
        case 'decor':
            furnitureObj = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), material);
            break;
        default:
            furnitureObj = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    }

    furnitureObj.position.copy(position);
    furnitureObj.position.y = furnitureObj.geometry.parameters.height / 2 || 0.5;
    furnitureObj.castShadow = true;
    furnitureObj.receiveShadow = true;
    furnitureObj.userData = { furniture, id: Date.now() };

    roomScene.add(furnitureObj);
    roomObjects.push(furnitureObj);
    roomFurniture.push({ furniture, position: furnitureObj.position.toArray(), rotation: furnitureObj.rotation.toArray() });

    console.log(`Added ${furniture.name} to room at`, position);
}

function onRoomPointerDown(event) {
    if (!roomRenderer || !roomScene || !roomCamera) return;
    const rect = roomRenderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    roomPointer.set(x, y);
    roomRaycaster.setFromCamera(roomPointer, roomCamera);

    // Intersect only selectable meshes
    const intersects = roomRaycaster.intersectObjects(roomScene.children, true)
        .filter(i => i.object.userData && i.object.userData.selectable);

    if (intersects.length > 0) {
        const picked = intersects[0].object;
        // Find top-level parent within scene to attach transform
        let attachObj = picked;
        while (attachObj.parent && attachObj.parent !== roomScene) {
            attachObj = attachObj.parent;
        }

        selectedObject = attachObj;

        if (transformControls) {
            transformControls.attach(selectedObject);
        }

        // Highlight: simple emissive tint on picked meshes
        try {
            picked.material = picked.material || picked.userData.originalMaterial;
            if (!picked.userData._originalEmissive) picked.userData._originalEmissive = picked.material.emissive ? picked.material.emissive.clone() : null;
            if (picked.material.emissive) picked.material.emissive.setHex(0x444444);
        } catch (e) {
            // ignore material tinting errors
        }

        // Update properties panel if present
        const props = document.getElementById('itemProperties');
        if (props) {
            props.innerHTML = `<div class="text-left"><strong>Selected:</strong><div>${selectedObject.name || selectedObject.type}</div><div class="text-xs text-gray-500 mt-2">Use W/E/R to change gizmo mode, Del to remove</div></div>`;
        }
    } else {
        // Clicked empty space: detach
        if (transformControls) transformControls.detach();
        selectedObject = null;
        const props = document.getElementById('itemProperties');
        if (props) props.innerHTML = `<i class="fas fa-hand-pointer text-4xl text-gray-300 mb-3"></i><p class="text-gray-500 font-body text-sm">Select an item to view properties</p>`;
    }
}

function onRoomKeyDown(e) {
    if (!transformControls) return;

    const key = e.key.toLowerCase();
    if (key === 'w') {
        transformControls.setMode('translate');
    } else if (key === 'e') {
        transformControls.setMode('rotate');
    } else if (key === 'r') {
        transformControls.setMode('scale');
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObject && selectedObject.parent) {
            selectedObject.parent.remove(selectedObject);
            transformControls.detach();
            selectedObject = null;
        }
    }
}

function animateRoom() {
    if (!roomRenderer || !roomScene || !roomCamera) {
        return; // Stop animation if resources are cleaned up
    }

    requestAnimationFrame(animateRoom);
    
    if (roomControls) {
        roomControls.update();
    }

    try {
        roomRenderer.render(roomScene, roomCamera);
    } catch (error) {
        console.error('Error rendering room:', error);
    }
}

function initializeRoom() {
    // Legacy fallback - now handled by initializeRoom3D
    initializeRoom3D();
}

function loadDesignerFurniture(category) {
    const list = document.getElementById('designerFurnitureList');
    if (!list) return;

    const filtered = category === 'all' 
        ? designerFurnitureLibrary 
        : designerFurnitureLibrary.filter(item => item.category === category);

    list.innerHTML = filtered.map(item => `
        <div class="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-all cursor-move" draggable="true" data-furniture-id="${item.id}">
            <img src="${item.thumbnail}" alt="${item.name}" class="w-full h-32 object-cover">
            <div class="p-3">
                <h5 class="font-display font-bold text-primary text-sm mb-1">${item.name}</h5>
                <p class="font-body text-secondary text-xs font-semibold">$${item.price}</p>
            </div>
        </div>
    `).join('');

    // Add drag listeners
    list.querySelectorAll('[draggable="true"]').forEach(el => {
        el.addEventListener('dragstart', handleDragStart);
    });
}

function filterDesignerFurniture(category) {
    // Update active button
    document.querySelectorAll('#roomDesignerModal button[onclick^="filterDesignerFurniture"]').forEach(btn => {
        btn.classList.remove('bg-primary', 'text-white');
        btn.classList.add('hover:bg-gray-200', 'text-gray-700');
    });
    event.target.classList.add('bg-primary', 'text-white');
    event.target.classList.remove('hover:bg-gray-200', 'text-gray-700');

    loadDesignerFurniture(category);
}

function handleDragStart(e) {
    e.dataTransfer.setData('furnitureId', e.target.dataset.furnitureId);
}

function changeRoomView(view) {
    // Update active button
    document.querySelectorAll('#roomDesignerModal button[onclick^="changeRoomView"]').forEach(btn => {
        btn.classList.remove('bg-primary', 'text-white');
        btn.classList.add('bg-gray-100', 'hover:bg-gray-200');
    });
    event.target.classList.add('bg-primary', 'text-white');
    event.target.classList.remove('bg-gray-100', 'hover:bg-gray-200');

    alert(`📐 Switched to ${view === 'top' ? 'Top' : '3D'} view!\n\nThis feature would show different camera angles in a full implementation.`);
}

function clearRoom() {
    if (confirm('🗑️ Are you sure you want to clear all furniture from the room?')) {
        // Remove all furniture objects from scene
        roomObjects.forEach(obj => {
            if (roomScene) {
                roomScene.remove(obj);
            }
        });
        roomObjects = [];
        roomFurniture = [];
        selectedItem = null;
        alert('✨ Room cleared successfully!');
    }
}

function saveRoomDesign() {
    if (!currentRoom) {
        alert('⚠️ Please select a room template first!');
        return;
    }

    const design = {
        room: currentRoom.name,
        furniture: roomFurniture,
        date: new Date().toISOString()
    };

    // Save to localStorage
    const savedDesigns = JSON.parse(localStorage.getItem('roomDesigns') || '[]');
    savedDesigns.push(design);
    localStorage.setItem('roomDesigns', JSON.stringify(savedDesigns));

    alert(`💾 Design saved successfully!\n\nRoom: ${currentRoom.name}\nFurniture items: ${roomFurniture.length}\n\nYou can access your saved designs anytime from your account.`);
}

// ============================================
// WINDOW GLOBAL FUNCTIONS
// ============================================
// Make functions globally available for onclick handlers
window.show3DViewer = show3DViewer;
window.open3DViewer = open3DViewer;
window.close3DViewer = close3DViewer;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.toggleWishlist = toggleWishlist;
window.showLoginModal = showLoginModal;
window.showRegisterForm = showRegisterForm;
window.showLoginForm = showLoginForm;
window.closeUserModal = closeUserModal;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.showUserProfile = showUserProfile;
window.filterPartnerProducts = filterPartnerProducts;
window.scrollToProducts = scrollToProducts;
window.scrollToRooms = scrollToRooms;
window.selectPlan = selectPlan;
window.toggleFAQ = toggleFAQ;
window.openRoomDesigner = openRoomDesigner;
window.closeRoomDesigner = closeRoomDesigner;
window.selectRoomTemplate = selectRoomTemplate;
window.filterDesignerFurniture = filterDesignerFurniture;
window.changeRoomView = changeRoomView;
window.clearRoom = clearRoom;
window.saveRoomDesign = saveRoomDesign;
