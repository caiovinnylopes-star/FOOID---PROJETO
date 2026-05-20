
import React, { useState, useEffect, useCallback, useMemo, FC, useRef } from 'react';
import { Screen, User, Product, ShoppingItem, Notification, Settings, Recipe, NotificationFilter, CategoryKey, StorageKey, CATEGORIES, STORAGE_TYPES, ScannedItem, NotificationType, NFCeProduct } from './types';
import { HomeIcon, PantryIcon, BellIcon, MenuIcon, PlusIcon, ArrowLeftIcon, TrashIcon, PencilIcon, ScannerIcon, UserIcon, CloseIcon, RecipeIcon, SettingsIcon, ShoppingListIcon, GoogleIcon, FacebookIcon, AppleIcon, BarcodeIcon, CameraIcon, MicIcon, SparklesIcon, ReceiptIcon } from './components/Icons';
import ScannerComponent from './components/ScannerComponent';
import QRScannerComponent from './components/QRScannerComponent';
import { GoogleGenAI, Type } from "@google/genai";
import { auth, db } from './firebase';
import { 
    onAuthStateChanged, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    updatePassword,
    User as FirebaseUser,
    sendPasswordResetEmail
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, writeBatch, serverTimestamp, query, orderBy } from 'firebase/firestore';

// --- ERROR HANDLING ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- LOCALSTORAGE KEYS ---
const FOOID_USER_KEY = 'fooid_user';
const FOOID_PRODUCTS_KEY = 'fooid_products';
const FOOID_SHOPPING_LIST_KEY = 'fooid_shopping_list';
const FOOID_SETTINGS_KEY = 'fooid_settings';
const FOOID_SCANNED_HISTORY_KEY = 'fooid_scanned_history';
const FOOID_NOTIFICATIONS_KEY = 'fooid_notifications_read_status';

// --- MOCK DATA ---
const MOCK_USER: User = { name: 'Usuário', email: 'usuario@email.com' };

const MOCK_PRODUCTS: Product[] = [
    { id: 1, name: 'Arroz Branco', quantity: '5kg', unit: 2, expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(), storage: 'pantry', category: 'grains' },
    { id: 2, name: 'Feijão Carioca', quantity: '2kg', unit: 2, expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), storage: 'pantry', category: 'grains' },
    { id: 3, name: 'Leite Integral', quantity: '1L', unit: 1, expiryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), storage: 'fridge', category: 'dairy' }, // Vencido (-5 dias) e Estoque Baixo (unit: 1)
    { id: 4, name: 'Ovos', quantity: '12 un', unit: 2, expiryDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), storage: 'fridge', category: 'meats' }, 
    { id: 5, name: 'Macarrão Espaguete', quantity: '500g', unit: 3, expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(), storage: 'pantry', category: 'grains' },
    { id: 6, name: 'Molho de Tomate', quantity: '340g', unit: 4, expiryDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(), storage: 'pantry', category: 'others' },
    { id: 7, name: 'Peito de Frango', quantity: '1kg', unit: 2, expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), storage: 'freezer', category: 'meats' },
    { id: 8, name: 'Cebola', quantity: '1kg', unit: 5, expiryDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(), storage: 'fruit-bowl', category: 'vegetables' },
    { id: 9, name: 'Alho', quantity: '200g', unit: 3, expiryDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(), storage: 'fruit-bowl', category: 'vegetables' },
    { id: 10, name: 'Azeite de Oliva', quantity: '500ml', unit: 2, expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), storage: 'pantry', category: 'others' },
    { id: 11, name: 'Queijo Mussarela', quantity: '300g', unit: 2, expiryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), storage: 'fridge', category: 'dairy' },
    { id: 12, name: 'Tomate', quantity: '4 un', unit: 4, expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), storage: 'fridge', category: 'fruits' }, 
    { id: 13, name: 'Cenoura', quantity: '3 un', unit: 3, expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), storage: 'fridge', category: 'vegetables' },
    { id: 14, name: 'Manteiga', quantity: '200g', unit: 2, expiryDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString(), storage: 'fridge', category: 'dairy' },
];

const MOCK_RECIPES: Recipe[] = [
  { id: 1, title: 'Arroz com Feijão', subtitle: 'Prato tradicional brasileiro', prepTime: '30 min', difficulty: 'Fácil', ingredients: ['Arroz', 'Feijão', 'Temperos'], image: 'https://image.pollinations.ai/prompt/Brazilian%20Rice%20and%20Beans%20delicious%20food%20photography?width=800&height=600&nologo=true', category: 'all' },
  { id: 2, title: 'Salada Nutritiva', subtitle: 'Rica em vitaminas e fibras', prepTime: '15 min', difficulty: 'Fácil', ingredients: ['Alface', 'Tomate', 'Cenoura'], image: 'https://image.pollinations.ai/prompt/Fresh%20Healthy%20Salad%20Bowl%20food%20photography?width=800&height=600&nologo=true', category: 'healthy' },
  { id: 3, title: 'Macarrão Simples', subtitle: 'Rápido e saboroso', prepTime: '20 min', difficulty: 'Fácil', ingredients: ['Macarrão', 'Molho', 'Queijo'], image: 'https://image.pollinations.ai/prompt/Pasta%20Tomato%20Sauce%20Cheese%20food%20photography?width=800&height=600&nologo=true', category: 'quick' },
];

const DEFAULT_SETTINGS: Settings = {
  appearance: { darkMode: false, fontSize: 'Normal' },
  notifications: { expiryAlerts: true, stockAlerts: true, alertDays: 15 },
  accessibility: { highContrast: false, reducedMotion: false },
};

// --- HELPER FUNCTIONS ---
const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " anos atrás";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses atrás";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " dias atrás";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " horas atrás";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " min atrás";
    return "Agora";
};

const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return 'Data pendente';
    const days = Math.ceil((new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
    if (days < 0) return 'Vencido';
    if (days === 0) return 'Vence hoje';
    return `Vence em ${days} dias`;
};

const smartCategorize = (categories: string = '', productName: string = ''): CategoryKey => {
    const text = (categories + ' ' + productName).toLowerCase();
    
    if (text.match(/leite|iogurte|queijo|manteiga|requeijão|nata|creme de leite|laticinio|dairy|yogurt|cheese|butter|lactea|láctea|yakult|danone/)) return 'dairy';
    if (text.match(/pao|pão|torrada|bolo|farinha|arroz|feijao|feijão|macarrão|milho|cereal|aveia|biscoito|bolacha|grain|bread|pasta|rice|bean|trigo|milho|fubá|tapioca|lasanha/)) return 'grains';
    if (text.match(/carne|frango|peixe|porco|bife|hamburguer|linguiça|salsicha|presunto|mortadela|bacon|meat|chicken|beef|fish|pork|peru|chester|file|filé|nugget/)) return 'meats';
    if (text.match(/fruta|maça|banana|laranja|uva|abacaxi|morango|limão|melancia|mamão|fruit|apple|pera|pêssego|maracujá|manga|goiaba/)) return 'fruits';
    if (text.match(/vegetal|legume|tomate|cenoura|alface|batata|cebola|alho|pimentão|brócolis|couve|vegetable|tomato|carrot|pepino|beterraba|abobora|abóbora|repolho/)) return 'vegetables';
    if (text.match(/agua|água|refrigerante|suco|chá|café|cerveja|vinho|vodka|drink|bebida|soda|juice|water|coke|beer|néctar|refresco|energetico|energético/)) return 'beverages';
    if (text.match(/limpeza|sabao|sabão|detergente|desinfetante|amaciante|agua sanitaria|água sanitária|bucha|esponja|clean|soap|multiuso|álcool|alcool|veja|omo|ype/)) return 'cleaning';
    if (text.match(/higiene|shampoo|sabonete|pasta de dente|escova|papel higienico|desodorante|hygiene|creme dental|fio dental|condicionador|hidratante/)) return 'hygiene';
    
    return 'others';
};

const parsePrice = (priceStr?: string) => {
    if (!priceStr) return 0;
    const cleaned = priceStr.replace('R$', '').replace(/\s/g, '').replace(',', '.');
    return parseFloat(cleaned) || 0;
};

// --- IMAGE UTILS ---
const compressImage = async (fileOrUrl: File | string): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // For Pollinations CORS
        
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxWidth = 300;
            const maxHeight = 300;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx?.drawImage(img, 0, 0, width, height);
            // Save as JPEG with 0.7 quality to reduce size for LocalStorage
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };

        img.onerror = (err) => reject(err);

        if (typeof fileOrUrl === 'string') {
            img.src = fileOrUrl;
        } else {
            img.src = URL.createObjectURL(fileOrUrl);
        }
    });
};

function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [state, setState] = useState<T>(() => {
        try {
            const storedValue = localStorage.getItem(key);
            return storedValue ? JSON.parse(storedValue) : defaultValue;
        } catch (error) {
            console.error(`Error reading localStorage key “${key}”:`, error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.error(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key, state]);

    return [state, setState];
}

const App: React.FC = () => {
    const [screen, setScreen] = useState<Screen>('splash');
    const [user, setUser] = useState<User | null>(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [products, setProducts] = useState<Product[]>([]);
    const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
    const [scannedHistory, setScannedHistory] = useState<ScannedItem[]>([]);
    
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [readNotificationIds, setReadNotificationIds] = usePersistentState<number[]>(FOOID_NOTIFICATIONS_KEY, []);

    const [recipes, setRecipes] = useState<Recipe[]>(MOCK_RECIPES);
    const [settings, setSettings] = usePersistentState<Settings>(FOOID_SETTINGS_KEY, DEFAULT_SETTINGS);
    
    const [isScannerOpen, setScannerOpen] = useState(false);
    const [scannerMode, setScannerMode] = useState<'barcode' | 'qrcode' | 'nfce'>('barcode');
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    
    const [isAddProductModalOpen, setAddProductModalOpen] = useState(false);
    const [addProductInitialData, setAddProductInitialData] = useState<{name: string, category?: CategoryKey, quantity?: string, unit?: number, expiryDate?: string, image?: string, barcode?: string} | null>(null);

    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [editingShoppingItem, setEditingShoppingItem] = useState<ShoppingItem | null>(null);
    const [isAddShoppingItemModalOpen, setAddShoppingItemModalOpen] = useState(false);
    const [isAddFromPantryModalOpen, setAddFromPantryModalOpen] = useState(false);
    const [isFetchingScannedProduct, setIsFetchingScannedProduct] = useState(false);
    
    const [isDateSelectionModalOpen, setDateSelectionModalOpen] = useState(false);
    const [tempScannedData, setTempScannedData] = useState<any>(null);

    const [scannedLink, setScannedLink] = useState<string | null>(null);
    const [nfceProducts, setNfceProducts] = useState<NFCeProduct[]>([]);
    const [isImportingNfce, setIsImportingNfce] = useState(false);
    const [isPhotoFallbackModalOpen, setPhotoFallbackModalOpen] = useState(false);

    // PWA Install Prompt State
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

    const darkMode = settings.appearance.darkMode;
    const highContrast = settings.accessibility.highContrast;

    // --- PWA INSTALL LISTENER ---
    useEffect(() => {
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e);
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }, []);

    const handleInstallClick = () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult: any) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            setDeferredPrompt(null);
        });
    };

    // --- FIRESTORE LISTENERS ---
    useEffect(() => {
        if (!user || !auth.currentUser) {
            setProducts([]);
            setShoppingList([]);
            setScannedHistory([]);
            return;
        }

        const uid = auth.currentUser.uid;
        
        const unsubProducts = onSnapshot(collection(db, `users/${uid}/products`), (snapshot) => {
            const data: Product[] = [];
            snapshot.forEach(d => data.push(d.data() as Product));
            setProducts(data);
        });

        const unsubShopping = onSnapshot(collection(db, `users/${uid}/shoppingList`), (snapshot) => {
            const data: ShoppingItem[] = [];
            snapshot.forEach(d => data.push(d.data() as ShoppingItem));
            setShoppingList(data);
        });

        const unsubHistory = onSnapshot(collection(db, `users/${uid}/scannedHistory`), (snapshot) => {
            const data: ScannedItem[] = [];
            snapshot.forEach(d => data.push(d.data() as ScannedItem));
            setScannedHistory(data.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
        });

        return () => {
            unsubProducts();
            unsubShopping();
            unsubHistory();
        };
    }, [user]);

    // --- FONT SIZE EFFECT ---
    useEffect(() => {
        const html = document.documentElement;
        switch (settings.appearance.fontSize) {
            case 'Grande':
                html.style.fontSize = '115%';
                break;
            case 'Extra Grande':
                html.style.fontSize = '130%';
                break;
            default:
                html.style.fontSize = '100%';
        }
    }, [settings.appearance.fontSize]);

    useEffect(() => {
        const generateNotifications = () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const thresholdDays = settings.notifications.alertDays || 15;
            const stockAlertEnabled = settings.notifications.stockAlerts;

            const newNotifications: Notification[] = [];

            products.forEach(p => {
                const isRead = readNotificationIds.includes(p.id);

                // 1. Check Low Stock (Priority) - NOW CHECKING UNIT FIELD
                const currentUnit = p.unit !== undefined ? p.unit : 1; 

                if (stockAlertEnabled && currentUnit <= 1) {
                     newNotifications.push({
                        id: p.id * 1000, // Unique ID for stock alert
                        type: 'low-stock',
                        icon: '📦',
                        title: 'Estoque Baixo!',
                        message: `O item "${p.name}" está acabando (${currentUnit} unidade${currentUnit === 1 ? '' : 's'}).`,
                        timestamp: new Date().toISOString(),
                        read: isRead
                    });
                }

                // 2. Check Expiry
                if (settings.notifications.expiryAlerts) {
                    const expiry = new Date(p.expiryDate);
                    expiry.setHours(0, 0, 0, 0);
                    const diffTime = expiry.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (diffDays <= thresholdDays) {
                        let type: NotificationType = 'expiry-soon';
                        let title = '';
                        let message = '';
                        let icon = '⚠️';

                        if (diffDays < 0) {
                            type = 'expired';
                            title = 'Produto Vencido!';
                            message = `O item "${p.name}" venceu há ${Math.abs(diffDays)} dias.`;
                            icon = '☠️';
                        } else if (diffDays === 0) {
                            type = 'expired';
                            title = 'Vence Hoje!';
                            message = `O item "${p.name}" vence hoje. Consuma imediatamente!`;
                            icon = '🚨';
                        } else {
                            type = 'expiry-soon';
                            title = `Vence em ${diffDays} dias`;
                            message = `O item "${p.name}" vence em ${diffDays} dias.`;
                            icon = '⏰';
                        }

                        newNotifications.push({
                            id: p.id,
                            type,
                            icon,
                            title,
                            message,
                            timestamp: new Date().toISOString(),
                            read: isRead
                        });
                    }
                }
            });

            // Sorting: Low Stock -> Expired -> Expiry Soon
            newNotifications.sort((a, b) => {
                if (a.type === 'low-stock' && b.type !== 'low-stock') return -1;
                if (b.type === 'low-stock' && a.type !== 'low-stock') return 1;
                
                if (a.type === 'expired' && b.type !== 'expired') return -1;
                if (b.type === 'expired' && a.type !== 'expired') return 1;
                
                return 0;
            });

            setNotifications(newNotifications);
        };

        generateNotifications();
    }, [products, readNotificationIds, settings.notifications]);

    // --- FIREBASE AUTH LISTENER ---
    useEffect(() => {
        getRedirectResult(auth).then((result) => {
            if (result) {
                updatePassword(result.user, "123456").catch(console.error);
                setScreen(prev => {
                    if (['welcome', 'login', 'register', 'splash'].includes(prev)) return 'dashboard';
                    return prev;
                });
            }
        }).catch((error) => {
            console.error("Redirect error:", error);
            // alert(`Erro no redirecionamento do Google: ${error.message} (${error.code})`);
        });

        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            if (firebaseUser) {
                // Set initial user info instantly to avoid UI delay
                setUser({
                    name: firebaseUser.displayName || 'Usuário',
                    email: firebaseUser.email || ''
                });

                // Fetch full profile from Firestore in the background
                (async () => {
                    try {
                        const userDocRef = doc(db, 'users', firebaseUser.uid);
                        const userDoc = await getDoc(userDocRef);
                        if (userDoc.exists()) {
                            const userData = userDoc.data();
                            setUser(prev => prev ? { ...prev, name: userData.name } : null);
                        } else {
                            // Create profile for new user
                            await setDoc(userDocRef, {
                                name: firebaseUser.displayName || 'Usuário',
                                email: firebaseUser.email || '',
                                createdAt: serverTimestamp()
                            });
                        }
                    } catch (error) {
                        console.error("Error fetching user profile:", error);
                    }
                })();
                
                setScreen(prev => {
                    if (['welcome', 'login', 'register', 'splash'].includes(prev)) return 'dashboard';
                    return prev;
                });
            } else {
                setUser(null);
                setScreen(prev => {
                    if (['dashboard', 'pantry', 'shoppingList', 'recipes', 'settings', 'editProfile'].includes(prev)) {
                        return 'welcome';
                    }
                    return prev;
                });
            }
            setIsLoadingAuth(false);
        });

        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (screen === 'splash' && !isLoadingAuth) {
            setScreen(user ? 'dashboard' : 'welcome');
        }
    }, [screen, user, isLoadingAuth]);
    
    const handleGoogleSignIn = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            
            // Transição IMEDIATA para o dashboard após popup
            setScreen('dashboard');
            
            try {
                await updatePassword(user, "123456");
            } catch (pwError: any) {
                console.error("Erro ao definir a senha padrão:", pwError);
            }
        } catch (error: any) {
            console.error("Google login error:", error);
            // Sempre tentar redirect se o popup falhar por qualquer motivo no mobile/PWA
            try {
                await signInWithRedirect(auth, provider);
            } catch (redirectError: any) {
                alert(`Erro ao redirecionar para o Google: ${redirectError.message}`);
            }
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            setScreen('welcome');
        } catch (error) {
            alert("Erro ao sair. Tente novamente.");
        }
    };

    const handleUpdateUser = (u: User) => {
        setUser(u);
        alert("Perfil atualizado com sucesso!");
    };

    const handleMarkAllNotificationsRead = () => {
        const newIds = notifications.map(n => n.id);
        const uniqueIds = Array.from(new Set([...readNotificationIds, ...newIds]));
        setReadNotificationIds(uniqueIds);
    };
    
    const handleAddProduct = async (product: Omit<Product, 'id'>) => {
        if (!auth.currentUser) return;
        const newId = String(Date.now());
        const newProduct = { ...product, id: newId };
        
        // Fecha o modal imediatamente para não deixar o usuário clicar duas vezes
        setAddProductModalOpen(false);
        setAddProductInitialData(null);
        
        try {
            await setDoc(doc(db, `users/${auth.currentUser.uid}/products`, newId), newProduct);
            
            if (scannedHistory.length > 0) {
                const latestScan = scannedHistory[0];
                if (latestScan.id) {
                    await updateDoc(doc(db, `users/${auth.currentUser.uid}/scannedHistory`, String(latestScan.id)), {
                        name: product.name,
                        quantity: product.quantity,
                        expiryDate: product.expiryDate,
                        image: product.image || latestScan.image
                    });
                }
            }
        } catch(e) { console.error("Error adding product", e); }
    };

    const handleUpdateProduct = async (updatedProduct: Product) => {
        if (!auth.currentUser) return;
        try {
            await updateDoc(doc(db, `users/${auth.currentUser.uid}/products`, String(updatedProduct.id)), updatedProduct as any);
        } catch(e) { console.error(e); }
        setEditingProduct(null);
    };

    const handleDeleteProduct = async (productId: string | number) => {
        if (!auth.currentUser) return;
        try {
            await deleteDoc(doc(db, `users/${auth.currentUser.uid}/products`, String(productId)));
        } catch(e) { console.error(e); }
    };
    
    const handleAddShoppingItem = async (item: Omit<ShoppingItem, 'id' | 'checked'>) => {
        if (!auth.currentUser) return;
        const newId = String(Date.now());
        
        // Fecha o modal imediatamente
        setAddShoppingItemModalOpen(false);
        
        try {
            await setDoc(doc(db, `users/${auth.currentUser.uid}/shoppingList`, newId), { ...item, id: newId, checked: false });
        } catch(e) { console.error(e); }
    };

    const handleUpdateShoppingItem = async (updatedItem: ShoppingItem) => {
        if (!auth.currentUser) return;
        try {
            await updateDoc(doc(db, `users/${auth.currentUser.uid}/shoppingList`, String(updatedItem.id)), updatedItem as any);
        } catch(e) { console.error(e); }
        setEditingShoppingItem(null);
    };

    const handleAddFromPantry = async (selectedProducts: Product[]) => {
        if (!auth.currentUser) return;
        try {
            const batch = writeBatch(db);
            selectedProducts.forEach(p => {
                const newId = String(Date.now() + Math.random());
                const ref = doc(db, `users/${auth.currentUser.uid}/shoppingList`, newId);
                batch.set(ref, {
                    id: newId,
                    name: p.name,
                    category: p.category,
                    quantity: '1 un',
                    checked: false
                });
            });
            await batch.commit();
        } catch(e) { console.error(e); }
        setAddFromPantryModalOpen(false);
    };

    const handleToggleShoppingItem = async (itemId: string | number) => {
        if (!auth.currentUser) return;
        const item = shoppingList.find(i => i.id === itemId);
        if (!item) return;
        try {
            await updateDoc(doc(db, `users/${auth.currentUser.uid}/shoppingList`, String(itemId)), { checked: !item.checked });
        } catch(e) { console.error(e); }
    };

    const handleDeleteShoppingItem = async (itemId: string | number) => {
        if (!auth.currentUser) return;
        try {
            await deleteDoc(doc(db, `users/${auth.currentUser.uid}/shoppingList`, String(itemId)));
        } catch(e) { console.error(e); }
    };

    const handleClearPurchased = async () => {
        if (!auth.currentUser) return;
        try {
            const batch = writeBatch(db);
            shoppingList.filter(item => item.checked).forEach(item => {
                batch.delete(doc(db, `users/${auth.currentUser.uid}/shoppingList`, String(item.id)));
            });
            await batch.commit();
        } catch(e) { console.error(e); }
    };

    const handleClearHistory = async () => {
        if (!auth.currentUser) return;
        try {
            const batch = writeBatch(db);
            scannedHistory.forEach(item => {
                if (item.id) batch.delete(doc(db, `users/${auth.currentUser.uid}/scannedHistory`, String(item.id)));
            });
            await batch.commit();
        } catch(e) { console.error(e); }
    };

    const handleScanSuccess = async (rawCode: string) => {
        setScannerOpen(false);

        // --- NEW LOGIC FOR QR CODES (LINKS) ---
        if (rawCode.startsWith('http') || rawCode.includes('://') || rawCode.startsWith('www.')) {
            const lowerCode = rawCode.toLowerCase();
            // Check if it's an NFC-e link
            if (scannerMode === 'nfce' || lowerCode.includes('sefaz') || lowerCode.includes('fazenda') || lowerCode.includes('nfe') || lowerCode.includes('nfce')) {
                handleNFCeScan(rawCode);
                return;
            }

            // Delay scan link modal to allow camera to unmount
            setTimeout(() => {
                 setScannedLink(rawCode);
            }, 200);
            return;
        }
        // -------------------------------------

        setIsFetchingScannedProduct(true);
        let lookupCode = rawCode;
        
        try {
            const url = `https://world.openfoodfacts.org/api/v0/product/${lookupCode}.json`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const data = await response.json();

            if (data.status !== 1 || !data.product) {
                throw new Error("Produto não encontrado na base.");
            }

            const p = data.product;
            
            let productName = p.product_name_pt || p.product_name_pt_br || p.product_name || "";

            if (!productName && p._keywords && Array.isArray(p._keywords)) {
                productName = p._keywords
                    .slice(0, 3)
                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ");
            }

            if (!productName) {
                productName = `Produto ${lookupCode}`;
            } else {
                const brand = p.brands ? p.brands.split(',')[0].trim() : '';
                if (brand && !productName.toLowerCase().includes(brand.toLowerCase())) {
                    productName = `${brand} - ${productName}`;
                }
            }

            const image = p.image_front_url || p.image_url || '';
            const quantity = p.quantity || p.product_quantity || (p.net_weight_value ? `${p.net_weight_value}${p.net_weight_unit || ''}` : '') || '1 un';
            const category = smartCategorize(p.categories || '', productName);

            const newItemId = String(Date.now());
            const newItem: ScannedItem = {
                id: newItemId,
                code: lookupCode,
                name: productName,
                image: image,
                timestamp: new Date().toISOString(),
                quantity: quantity
            };
            if (auth.currentUser) {
                setDoc(doc(db, `users/${auth.currentUser.uid}/scannedHistory`, newItemId), newItem).catch(console.error);
            }

            setTempScannedData({
                name: productName,
                category: category,
                quantity: quantity,
                unit: 1, 
                image: image,
                barcode: lookupCode
            });
            
            setIsFetchingScannedProduct(false);
            setDateSelectionModalOpen(true);

        } catch (error) {
            console.error("Erro ao buscar produto:", error);
            
            const fallbackName = `Produto ${lookupCode}`;
            const newItemId = String(Date.now());
            const newItem: ScannedItem = {
                id: newItemId,
                code: lookupCode,
                name: fallbackName,
                timestamp: new Date().toISOString(),
                quantity: '1 un'
            };
            if (auth.currentUser) {
                setDoc(doc(db, `users/${auth.currentUser.uid}/scannedHistory`, newItemId), newItem).catch(console.error);
            }

            setTempScannedData({ 
                name: fallbackName, 
                quantity: '1 un',
                unit: 1,
                barcode: lookupCode, 
                category: 'others' 
            });
            setIsFetchingScannedProduct(false);
            setDateSelectionModalOpen(true);
        }
    };

    const handleDateSelected = (dateISO: string) => {
        setDateSelectionModalOpen(false);
        setAddProductInitialData({
            ...tempScannedData,
            expiryDate: dateISO
        });
        setAddProductModalOpen(true);
    };

    const handleNFCeScan = async (url: string) => {
        setIsFetchingScannedProduct(true);
        try {
            // 1. Fetch HTML via CORS Proxy
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl);
            if (!res.ok) throw new Error("Erro ao acessar proxy");
            const proxyData = await res.json();
            const htmlContent = proxyData.contents;
            
            // 2. Extract raw text from HTML
            const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
            const elementsToRemove = doc.querySelectorAll('script, style, noscript, svg, img');
            for (let i = 0; i < elementsToRemove.length; i++) {
                 elementsToRemove[i].remove();
            }
            let text = doc.body.innerText || "";
            text = text.replace(/\s+/g, ' ').trim();

            // 3. Process with AI
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const prompt = `Você é um sistema especialista em extração de dados de notas fiscais brasileiras (NFC-e), com foco em supermercados.
Abaixo está o texto extraído da página da nota fiscal:
---
${text.substring(0, 20000)}
---
Extraia TODOS os produtos da nota.
Para cada produto, retornar:
nome_original (exatamente como está na nota)
nome_padronizado (nome simplificado, ex: "Arroz", "Leite", "Coca-Cola")
quantidade (número)
unidade (UN, KG, LT, etc)
categoria (ex: Grãos, Bebidas, Laticínios, Limpeza, Hortifruti, Carnes, etc)
Ignorar informações irrelevantes como:
dados do mercado
valores totais
impostos
Corrigir possíveis variações de escrita:
Ex:
"ARROZ TIO JOAO 5KG" → "Arroz"
"LEITE ITALAC INTEGRAL 1L" → "Leite Integral"
Retornar SOMENTE um JSON válido no formato:
{
"produtos": [
{
"nome_original": "...",
"nome_padronizado": "...",
"quantidade": 1,
"unidade": "UN",
"categoria": "..."
}
]
}
Caso não encontre produtos, retornar:
{
"produtos": []
}
IMPORTANTE:
Não explique nada
Não escreva texto fora do JSON
Retorne apenas JSON puro`;

            const response = await ai.models.generateContent({ 
                model: 'gemini-2.5-flash', 
                contents: prompt, 
                config: { 
                    responseMimeType: "application/json"
                } 
            });

            if (response.text) {
                const data = JSON.parse(response.text);
                if (data.produtos && data.produtos.length > 0) {
                    setNfceProducts(data.produtos);
                    setIsImportingNfce(true);
                } else {
                    alert("Nenhum produto encontrado nesta nota fiscal.");
                }
            }
        } catch (error) {
            console.error("Erro ao processar NFC-e:", error);
            setScannedLink(url);
            setPhotoFallbackModalOpen(true);
        } finally {
            setIsFetchingScannedProduct(false);
        }
    };

    const handleNFCePhotoScan = async (file: File) => {
        setIsFetchingScannedProduct(true);
        setPhotoFallbackModalOpen(false);
        try {
            const fileToBase64 = (f: File): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(f);
                    reader.onload = () => {
                        const result = reader.result as string;
                        const base64 = result.split(',')[1];
                        resolve(base64);
                    };
                    reader.onerror = error => reject(error);
                });
            };

            const base64Data = await fileToBase64(file);
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            
            const prompt = `Você é um sistema especialista em extração de dados de fotos de notas fiscais de supermercado brasileiras (NFC-e ou SAT).
Analise a imagem da nota fiscal e extraia TODOS os produtos listados nela.
Para cada produto, retorne:
- nome_original (exatamente como aparece escrito na nota)
- nome_padronizado (nome simplificado e legível para a despensa, ex: "Arroz", "Leite Integral", "Feijão Preto")
- quantidade (o número/quantidade comprada)
- unidade (a unidade de medida, ex: UN, KG, LT, CX, etc. Se não identificar, use UN)
- categoria (uma destas: Grãos/Massas, Bebidas, Laticínios, Limpeza, Hortifruti, Carnes, Outros)

Retorne APENAS um JSON válido no formato:
{
  "produtos": [
    {
      "nome_original": "...",
      "nome_padronizado": "...",
      "quantidade": 1,
      "unidade": "UN",
      "categoria": "..."
    }
  ]
}
Caso não encontre produtos na imagem, retorne:
{
  "produtos": []
}
Não dê explicações ou textos fora do JSON.`;

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: file.type
                        }
                    },
                    prompt
                ],
                config: {
                    responseMimeType: "application/json"
                }
            });

            if (response.text) {
                const data = JSON.parse(response.text);
                if (data.produtos && data.produtos.length > 0) {
                    setNfceProducts(data.produtos);
                    setIsImportingNfce(true);
                } else {
                    alert("Nenhum produto foi detectado na imagem desta nota fiscal. Tente tirar uma foto mais nítida e de perto.");
                }
            }
        } catch (error) {
            console.error("Erro no processamento visual da NFC-e:", error);
            alert("Não foi possível processar a imagem da nota fiscal. Verifique sua conexão ou tente novamente com outra foto.");
        } finally {
            setIsFetchingScannedProduct(false);
        }
    };

    const handleConfirmNfceImport = (selectedProducts: NFCeProduct[]) => {
        const newProducts: Product[] = selectedProducts.map(p => {
            // Map categories
            let cat: CategoryKey = 'others';
            const c = p.categoria.toLowerCase();
            if (c.includes('grão') || c.includes('pão') || c.includes('massa')) cat = 'grains';
            else if (c.includes('bebida') || c.includes('suco') || c.includes('refrigerante')) cat = 'beverages';
            else if (c.includes('laticínio') || c.includes('leite') || c.includes('queijo')) cat = 'dairy';
            else if (c.includes('limpeza')) cat = 'cleaning';
            else if (c.includes('hortifruti') || c.includes('fruta') || c.includes('vegetal') || c.includes('legume')) cat = 'vegetables';
            else if (c.includes('carne') || c.includes('frango') || c.includes('peixe')) cat = 'meats';
            else if (c.includes('higiene')) cat = 'hygiene';

            return {
                id: Date.now() + Math.random(),
                name: p.nome_padronizado,
                category: cat,
                quantity: `${p.quantidade} ${p.unidade}`,
                unit: p.quantidade,
                expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Default 30 days
                storage: 'pantry',
                notes: `Importado de NFC-e: ${p.nome_original}`
            };
        });

        setProducts(prev => [...prev, ...newProducts]);
        setIsImportingNfce(false);
        setNfceProducts([]);
        alert(`${newProducts.length} produtos importados com sucesso!`);
    };

    const navigate = useCallback((s: Screen) => setScreen(s), []);

    let mainContent;
    const toggleSidebar = () => setSidebarOpen(true);
    
    const commonProps = { darkMode, highContrast, onNavigate: navigate };

    switch (screen) {
        case 'splash':
            mainContent = <SplashScreen />;
            break;
        case 'welcome':
            mainContent = <WelcomeScreen onNavigate={navigate} />;
            break;
        case 'login':
            mainContent = <LoginScreen onNavigate={navigate} {...commonProps} onGoogleSignIn={handleGoogleSignIn} />;
            break;
        case 'register':
            mainContent = <RegisterScreen onNavigate={navigate} onGoogleSignIn={handleGoogleSignIn} />;
            break;
        case 'dashboard':
            mainContent = <DashboardScreen {...commonProps} onLogout={handleLogout} onToggleSidebar={toggleSidebar} notifications={notifications} />;
            break;
        case 'pantry':
            mainContent = <PantryScreen {...commonProps} products={products} onAddClick={() => setAddProductModalOpen(true)} onEditProduct={setEditingProduct} onDeleteProduct={handleDeleteProduct} />;
            break;
        case 'scanner':
            mainContent = <ScannerLandingScreen {...commonProps} scannedHistory={scannedHistory} onClearHistory={handleClearHistory} onOpenScanner={(mode) => { setScannerMode(mode); setScannerOpen(true); }} onPhotoScan={() => setPhotoFallbackModalOpen(true)} />;
            break;
        case 'notifications':
            mainContent = <NotificationsScreen {...commonProps} notifications={notifications} onMarkAllRead={handleMarkAllNotificationsRead} />;
            break;
        case 'shoppingList':
            mainContent = <ShoppingListScreen {...commonProps} items={shoppingList} onAddClick={() => setAddShoppingItemModalOpen(true)} onToggleItem={handleToggleShoppingItem} onDeleteItem={handleDeleteShoppingItem} onEditItem={setEditingShoppingItem} onClearPurchased={handleClearPurchased} onAddFromPantry={() => setAddFromPantryModalOpen(true)} />;
            break;
        case 'recipes':
            mainContent = <RecipesScreen {...commonProps} recipes={recipes} pantryProducts={products} setRecipes={setRecipes} />;
            break;
        case 'settings':
            mainContent = <SettingsScreen {...commonProps} settings={settings} setSettings={setSettings} />;
            break;
        case 'editProfile':
            mainContent = <EditProfileScreen {...commonProps} user={user} onUpdateUser={handleUpdateUser} />;
            break;
        default:
            mainContent = <DashboardScreen {...commonProps} onLogout={handleLogout} onToggleSidebar={toggleSidebar} notifications={notifications} />;
    }

    return (
        <div className={`h-[100dvh] w-screen font-sans overflow-hidden select-none 
            ${highContrast ? 'bg-black text-yellow-400' : (darkMode ? 'bg-zinc-900 text-white' : 'bg-gray-50 text-gray-800')}`}>
            
            <Sidebar 
                isOpen={isSidebarOpen} 
                onClose={() => setSidebarOpen(false)} 
                onNavigate={navigate} 
                darkMode={darkMode} 
                highContrast={highContrast} 
                deferredPrompt={deferredPrompt}
                onInstallClick={handleInstallClick}
            />
            
            <main className={`h-full w-full relative transition-all duration-300 ease-in-out ${isSidebarOpen ? 'brightness-50' : ''}`}>
                {mainContent}
            </main>

            {isScannerOpen && (
                scannerMode === 'barcode' ? (
                    <ScannerComponent mode={scannerMode} onScanSuccess={handleScanSuccess} onClose={() => setScannerOpen(false)} />
                ) : (
                    <QRScannerComponent onScanSuccess={handleScanSuccess} onClose={() => setScannerOpen(false)} />
                )
            )}
            {isFetchingScannedProduct && <LoadingSpinner message="Buscando dados do produto..." />}
            
            {isDateSelectionModalOpen && (
                <DateSelectionModal 
                    onClose={() => setDateSelectionModalOpen(false)} 
                    onConfirm={handleDateSelected} 
                    darkMode={darkMode} 
                    highContrast={highContrast} 
                />
            )}

            {scannedLink && (
                <LinkConfirmationModal 
                    link={scannedLink}
                    onConfirm={() => {
                        window.open(scannedLink, '_blank');
                        setScannedLink(null);
                    }}
                    onCancel={() => setScannedLink(null)}
                    darkMode={darkMode}
                    highContrast={highContrast}
                />
            )}

            {isAddProductModalOpen && <AddProductModal onClose={() => { setAddProductModalOpen(false); setAddProductInitialData(null); }} onAdd={handleAddProduct} initialData={addProductInitialData} darkMode={darkMode} highContrast={highContrast} />}
            {editingProduct && <EditProductModal product={editingProduct} onClose={() => setEditingProduct(null)} onUpdate={handleUpdateProduct} darkMode={darkMode} highContrast={highContrast} />}
            {isAddShoppingItemModalOpen && <AddShoppingItemModal onClose={() => setAddShoppingItemModalOpen(false)} onAdd={handleAddShoppingItem} darkMode={darkMode} highContrast={highContrast} />}
            {editingShoppingItem && <EditShoppingItemModal item={editingShoppingItem} onClose={() => setEditingShoppingItem(null)} onUpdate={handleUpdateShoppingItem} darkMode={darkMode} highContrast={highContrast} />}
            {isAddFromPantryModalOpen && <AddFromPantryModal products={products} onClose={() => setAddFromPantryModalOpen(false)} onAdd={handleAddFromPantry} darkMode={darkMode} highContrast={highContrast} />}
            {isImportingNfce && <NFCeImportModal products={nfceProducts} onClose={() => setIsImportingNfce(false)} onConfirm={handleConfirmNfceImport} darkMode={darkMode} highContrast={highContrast} />}
            {isPhotoFallbackModalOpen && (
                <PhotoFallbackModal 
                    onClose={() => setPhotoFallbackModalOpen(false)}
                    onPhotoSelected={handleNFCePhotoScan}
                    darkMode={darkMode}
                    highContrast={highContrast}
                />
            )}
        </div>
    );
};

// ... [Existing Components: ModalWrapper, ForgotPasswordModal, DateSelectionModal, LoadingSpinner, RecipeModal, AddFromPantryModal] ...

const LinkConfirmationModal: FC<{ link: string, onConfirm: () => void, onCancel: () => void, darkMode?: boolean, highContrast?: boolean }> = ({ link, onConfirm, onCancel, darkMode, highContrast }) => {
    const bgClass = highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-zinc-800 text-white' : 'bg-white text-gray-800');
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-6 animate-fade-in-down">
            <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 ${bgClass}`}>
                <div className="relative z-[60]">
                    <h3 className="text-lg font-bold mb-2">Link Detectado</h3>
                    <p className={`text-sm mb-6 break-all ${highContrast ? 'text-yellow-200' : 'text-gray-500'}`}>{link}</p>
                    
                    <div className="flex gap-3">
                        <button onClick={onCancel} className={`flex-1 py-3 font-bold rounded-xl border ${highContrast ? 'border-yellow-400 text-yellow-400' : 'border-gray-300 text-gray-600'}`}>Cancelar</button>
                        <button onClick={onConfirm} className={`flex-1 py-3 font-bold rounded-xl ${highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white'}`}>Acessar Link</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PhotoFallbackModal: FC<{ onClose: () => void, onPhotoSelected: (file: File) => void, darkMode?: boolean, highContrast?: boolean }> = ({ onClose, onPhotoSelected, darkMode, highContrast }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onPhotoSelected(file);
        }
    };

    const bgClass = highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-zinc-800 text-white' : 'bg-white text-gray-800');

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-6 animate-fade-in-down">
            <input 
                type="file" 
                accept="image/*" 
                capture="environment" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleFileChange} 
            />
            <div className={`w-full max-w-sm rounded-3xl shadow-2xl p-6 ${bgClass} border ${highContrast ? 'border-yellow-400' : 'border-white/10'}`}>
                <div className="relative z-[60] flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/30 rounded-full flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-yellow-500">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                    </div>

                    <div>
                        <h3 className="text-lg font-black tracking-wide">Bloqueio da Sefaz</h3>
                        <p className={`text-xs mt-2 px-2 leading-relaxed ${highContrast ? 'text-yellow-200' : 'text-gray-400'}`}>
                            Não conseguimos ler esta nota fiscal automaticamente pelo link da Secretaria da Fazenda (Sefaz), pois o portal deles bloqueou o acesso robótico do app.
                        </p>
                        <p className={`text-xs mt-2 font-bold ${highContrast ? 'text-yellow-400' : 'text-emerald-500'}`}>
                            Solução Inteligente: Tire uma foto nítida e de perto da nota impressa para extrair os produtos usando nossa Inteligência Artificial!
                        </p>
                    </div>
                    
                    <div className="flex flex-col gap-2 w-full mt-2">
                        <button 
                            onClick={() => fileInputRef.current?.click()} 
                            className={`w-full py-3.5 font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-sm ${
                                highContrast ? 'bg-yellow-400 text-black' : 'bg-emerald-500 text-black font-extrabold hover:bg-emerald-400'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                            </svg>
                            Tirar Foto da Nota
                        </button>

                        <button 
                            onClick={onClose} 
                            className={`w-full py-3.5 font-bold rounded-2xl border transition-all text-sm ${
                                highContrast ? 'border-yellow-400 text-yellow-400' : 'border-zinc-700 text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            Ver Link Manualmente
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ModalWrapper: FC<{ children: React.ReactNode, onClose: () => void, title: string, darkMode?: boolean, highContrast?: boolean }> = ({ children, onClose, title, darkMode, highContrast }) => {
    const bgClass = highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-zinc-800 text-white' : 'bg-gradient-to-br from-red-500 to-red-700 text-white');
    const closeBtnClass = highContrast ? 'text-yellow-400 hover:text-yellow-200' : (darkMode ? 'text-gray-400 hover:text-white' : 'text-white');

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4 animate-fade-in-down">
            <div className={`w-full max-w-sm rounded-2xl shadow-2xl p-6 relative ${bgClass}`}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">{title}</h2>
                    <button onClick={onClose} className={`text-2xl font-bold ${closeBtnClass}`}>&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
};

const ForgotPasswordModal: FC<{ onClose: () => void, onSend: (email: string) => void, darkMode?: boolean, highContrast?: boolean }> = ({ onClose, onSend, darkMode, highContrast }) => {
    const [email, setEmail] = useState('');
    const inputClass = `w-full mt-2 p-3 rounded-lg outline-none ${highContrast ? 'bg-black text-yellow-400 border-2 border-yellow-400' : (darkMode ? 'bg-zinc-700 text-white' : 'bg-white text-gray-800')}`;
    return (
        <ModalWrapper onClose={onClose} title="Recuperar Senha" darkMode={darkMode} highContrast={highContrast}>
            <p className={`text-sm mb-4 ${highContrast ? 'text-yellow-200' : 'text-white/80'}`}>Digite seu e-mail cadastrado para receber o link de recuperação de senha.</p>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" className={inputClass} autoFocus />
            <button onClick={() => onSend(email)} disabled={!email} className={`w-full py-3 font-bold rounded-lg mt-6 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-white text-red-600'} disabled:opacity-50`}>Enviar Link</button>
        </ModalWrapper>
    );
};

const DateSelectionModal: FC<{ onClose: () => void, onConfirm: (date: string) => void, darkMode?: boolean, highContrast?: boolean }> = ({ onClose, onConfirm, darkMode, highContrast }) => {
    const today = new Date();
    const [day, setDay] = useState(today.getDate());
    const [month, setMonth] = useState(today.getMonth());
    const [year, setYear] = useState(today.getFullYear());
    const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
    const years = Array.from({ length: 10 }, (_, i) => today.getFullYear() + i);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    const handleConfirm = () => {
        const daysInSelectedMonth = new Date(year, month + 1, 0).getDate();
        const validDay = Math.min(day, daysInSelectedMonth);
        const y = year;
        const m = String(month + 1).padStart(2, '0');
        const d = String(validDay).padStart(2, '0');
        onConfirm(`${y}-${m}-${d}`);
    };

    const bgClass = highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : 'bg-white text-gray-800';
    const buttonClass = highContrast ? 'bg-yellow-400 text-black' : 'bg-white text-gray-600 hover:bg-gray-50';
    const headerColor = highContrast ? 'text-yellow-400' : 'text-cyan-500';
    const lineColor = highContrast ? 'border-yellow-400' : 'border-cyan-400';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-6">
            <div className={`w-full max-w-sm rounded-lg shadow-2xl overflow-hidden ${bgClass}`}>
                <div className={`p-4 text-center border-b ${highContrast ? 'border-yellow-400' : 'border-gray-100'}`}>
                    <h3 className={`text-lg font-bold ${headerColor}`}>Selecione a data de vencimento.</h3>
                </div>
                <div className="flex justify-center items-center p-8 gap-4">
                    <div className="flex flex-col items-center h-32 overflow-y-scroll scrollbar-hide snap-y snap-mandatory w-16">
                        {days.map(d => <button key={d} onClick={() => setDay(d)} className={`snap-center text-xl py-2 w-full transition-all ${day === d ? (highContrast ? 'text-yellow-400 font-bold scale-125' : 'text-black font-bold scale-125') : (highContrast ? 'text-yellow-800' : 'text-gray-300')}`}>{d}</button>)}
                    </div>
                    <div className="flex flex-col items-center h-32 overflow-y-scroll scrollbar-hide snap-y snap-mandatory w-20 border-l border-r border-gray-100">
                        {months.map((m, i) => <button key={m} onClick={() => setMonth(i)} className={`snap-center text-xl py-2 w-full transition-all ${month === i ? (highContrast ? 'text-yellow-400 font-bold scale-125' : 'text-black font-bold scale-125') : (highContrast ? 'text-yellow-800' : 'text-gray-300')}`}>{m}</button>)}
                    </div>
                     <div className="flex flex-col items-center h-32 overflow-y-scroll scrollbar-hide snap-y snap-mandatory w-20">
                        {years.map(y => <button key={y} onClick={() => setYear(y)} className={`snap-center text-xl py-2 w-full transition-all ${year === y ? (highContrast ? 'text-yellow-400 font-bold scale-125' : 'text-black font-bold scale-125') : (highContrast ? 'text-yellow-800' : 'text-gray-300')}`}>{y}</button>)}
                    </div>
                </div>
                 <div className="flex justify-center px-8 -mt-20 pointer-events-none"><div className={`h-12 w-full border-t border-b ${lineColor}`}></div></div>
                 <div className="mt-10"></div>
                <div className="flex border-t border-gray-200">
                    <button onClick={onClose} className={`flex-1 py-4 font-bold ${buttonClass} ${highContrast ? 'border-r border-yellow-400' : 'border-r border-gray-100'}`}>Cancelar</button>
                    <button onClick={handleConfirm} className={`flex-1 py-4 font-bold ${buttonClass}`}>OK</button>
                </div>
            </div>
        </div>
    );
};

const LoadingSpinner: FC<{ message: string }> = ({ message }) => (
    <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col justify-center items-center z-50 p-4 text-white backdrop-blur-sm">
        <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-gray-200 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-500 rounded-full animate-spin border-t-transparent"></div>
        </div>
        <p className="mt-4 font-bold text-lg animate-pulse">{message}</p>
    </div>
);

const RecipeModal: FC<{ recipe: any, onClose: () => void, darkMode?: boolean, highContrast?: boolean }> = ({ recipe, onClose, darkMode, highContrast }) => {
    const containerClass = highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-gray-800');
    const headerClass = highContrast ? 'bg-yellow-400 text-black' : 'bg-gradient-to-t from-black via-black/50 to-transparent text-white';
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-end sm:items-center z-50 p-0 sm:p-4 animate-fade-in-down backdrop-blur-sm">
            <div className={`w-full max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl p-0 overflow-hidden h-[90vh] flex flex-col ${containerClass}`}>
                <div className="relative h-64 w-full flex-shrink-0">
                    <img src={recipe.image || 'https://placehold.co/600x400?text=Recipe'} alt={recipe.title} className="w-full h-full object-cover" />
                    <button onClick={onClose} className="absolute top-4 right-4 bg-black/40 p-2 rounded-full text-white hover:bg-black/60 z-20 backdrop-blur-md"><CloseIcon className="w-6 h-6"/></button>
                    <div className={`absolute bottom-0 left-0 right-0 p-6 pt-12 ${headerClass}`}>
                        <h2 className="text-3xl font-bold leading-tight shadow-black drop-shadow-md">{recipe.title}</h2>
                        <div className="flex gap-4 text-sm mt-2 font-semibold">
                            <span className="bg-black/30 px-2 py-1 rounded backdrop-blur-sm">🕒 {recipe.prepTime}</span>
                            <span className="bg-black/30 px-2 py-1 rounded backdrop-blur-sm">🍳 {recipe.difficulty}</span>
                        </div>
                    </div>
                </div>
                <div className="p-6 overflow-y-auto flex-grow">
                    <p className={`italic mb-6 text-lg font-medium leading-relaxed ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-300' : 'text-gray-600')}`}>"{recipe.subtitle}"</p>
                    <h3 className={`font-bold mb-3 border-b pb-2 uppercase tracking-wide text-sm ${highContrast ? 'text-yellow-400 border-yellow-400' : 'text-red-500 border-red-100'}`}>Ingredientes</h3>
                    <ul className="space-y-2 mb-8">
                        {recipe.ingredients.map((ing: string, i: number) => <li key={i} className="text-sm flex items-start gap-2"><span className="text-red-400">•</span> {ing}</li>)}
                    </ul>
                    <h3 className={`font-bold mb-3 border-b pb-2 uppercase tracking-wide text-sm ${highContrast ? 'text-yellow-400 border-yellow-400' : 'text-red-500 border-red-100'}`}>Modo de Preparo</h3>
                    <div className="space-y-4">
                        {(recipe.instructions || ["Preparo não disponível para esta receita mock."]).map((inst: string, i: number) => <div key={i} className="flex gap-4"><span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white'}`}>{i + 1}</span><p className="text-sm mt-1 leading-relaxed">{inst}</p></div>)}
                    </div>
                </div>
            </div>
        </div>
    );
};

const AddFromPantryModal: FC<{ products: Product[], onClose: () => void, onAdd: (products: Product[]) => void, darkMode?: boolean, highContrast?: boolean }> = ({ products, onClose, onAdd, darkMode, highContrast }) => {
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const toggleSelection = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]);
    const handleSubmit = () => onAdd(products.filter(p => selectedIds.includes(p.id)));
    return (
        <ModalWrapper onClose={onClose} title="Adicionar da Despensa" darkMode={darkMode} highContrast={highContrast}>
            <div className="mb-4"><p className="text-sm opacity-80">Selecione os itens que deseja adicionar à lista de compras:</p></div>
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1 mb-4">
                {products.length === 0 ? <p className="text-center opacity-60 py-4">Sua despensa está vazia.</p> : products.map(product => <div key={product.id} onClick={() => toggleSelection(product.id)} className={`p-3 rounded-lg flex justify-between items-center cursor-pointer transition-all border ${selectedIds.includes(product.id) ? (highContrast ? 'bg-yellow-400 text-black border-white' : 'bg-white text-red-600 border-white') : (highContrast ? 'bg-transparent border-yellow-400 hover:bg-yellow-900' : 'bg-white/10 border-transparent hover:bg-white/20')}`}><div><p className="font-bold">{product.name}</p><p className="text-xs opacity-80">{product.unit} un • {product.quantity}</p></div>{selectedIds.includes(product.id) && <span className="text-lg">✅</span>}</div>)}
            </div>
            <button onClick={handleSubmit} disabled={selectedIds.length === 0} className={`w-full py-3 font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed ${highContrast ? 'bg-yellow-400 text-black' : 'bg-white text-red-600'}`}>Adicionar Selecionados ({selectedIds.length})</button>
        </ModalWrapper>
    );
};

const AddProductModal: FC<{ onClose: () => void, onAdd: (product: Omit<Product, 'id'>) => void, initialData?: { name: string, category?: CategoryKey, quantity?: string, unit?: number, expiryDate?: string, image?: string, barcode?: string } | null, darkMode?: boolean, highContrast?: boolean }> = ({ onClose, onAdd, initialData, darkMode, highContrast }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [category, setCategory] = useState<CategoryKey | null>(initialData?.category || null);
    const [quantity, setQuantity] = useState(initialData?.quantity || '1 un');
    const [unit, setUnit] = useState<string | number>(initialData?.unit || 1); 
    const [expiryDate, setExpiryDate] = useState(initialData?.expiryDate ? initialData.expiryDate.split('T')[0] : '');
    const [storage, setStorage] = useState<StorageKey>('pantry');
    const [notes, setNotes] = useState('');
    const [barcode, setBarcode] = useState(initialData?.barcode || '');
    const [image, setImage] = useState(initialData?.image || '');
    const [isListening, setIsListening] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
    
    // Two-step camera flow state
    const [pendingProductImage, setPendingProductImage] = useState<string | null>(null);
    
    // Voice Recognition Refs
    const recognitionRef = useRef<any>(null);
    const accumulatedTextRef = useRef<string>("");
    const shouldStopRef = useRef(false);
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const expiryInputRef = useRef<HTMLInputElement>(null); // Dedicated ref for expiry photo
    
    // If we have an image in initialData, set it.
    useEffect(() => {
        if (initialData) {
            setName(initialData.name || '');
            setCategory(initialData.category || null);
            setQuantity(initialData.quantity || '1 un');
            setUnit(initialData.unit || 1); 
            const dateVal = initialData.expiryDate ? initialData.expiryDate.split('T')[0] : '';
            setExpiryDate(dateVal);
            setBarcode(initialData.barcode || '');
            setImage(initialData.image || '');
        }
    }, [initialData]);

    // Calendar trigger
    const [showDateModal, setShowDateModal] = useState(false);

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                shouldStopRef.current = true; // Ensure it doesn't restart
                recognitionRef.current.abort(); // Force stop
            }
        };
    }, []);

    const toggleListening = () => {
        if (isListening) {
            // Manual Stop
            shouldStopRef.current = true;
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        } else {
            // Start
            shouldStopRef.current = false;
            accumulatedTextRef.current = "";
            startListening();
        }
    };

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Seu navegador não suporta reconhecimento de voz.");
            return;
        }
        
        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true; // IMPORTANT: Keep listening
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
            // Accumulate all final results
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    accumulatedTextRef.current += event.results[i][0].transcript + " ";
                }
            }
        };

        recognition.onerror = (event: any) => {
             console.error("Speech recognition error", event.error);
             if (event.error === 'not-allowed') {
                 shouldStopRef.current = true;
                 setIsListening(false);
                 alert("Acesso ao microfone negado. Por favor, permita o acesso.");
             }
             // Handle no-speech by doing nothing and letting onend restart it
        };

        recognition.onend = () => {
            // If user didn't request stop, restart immediately
            if (!shouldStopRef.current) {
                try {
                    recognition.start();
                } catch (e) {
                    setIsListening(false);
                }
                return;
            }

            // User requested stop, process text
            setIsListening(false);
            if (accumulatedTextRef.current.trim().length > 0) {
                processVoiceCommand(accumulatedTextRef.current);
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    const processVoiceCommand = async (text: string) => {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const today = new Date().toISOString().split('T')[0];
            const prompt = `Analise este comando de voz para cadastro de produto: "${text}".
            Hoje é ${today}.
            Extraia os dados em JSON:
            {
                "name": string (nome do produto),
                "quantity": string (ex: '500g', '1L'),
                "unit": number (ex: 1),
                "category": string (one of: dairy, grains, meats, fruits, vegetables, beverages, cleaning, hygiene, others),
                "storage": string (one of: fridge, freezer, fruit-bowl, pantry),
                "expiryDate": string (YYYY-MM-DD, calcular data futura baseada no texto ex: 'vence em 20 dias' ou 'vence dia 15 de maio')
            }`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
            if (response.text) {
                const data = JSON.parse(response.text);
                if (data.name) setName(data.name);
                if (data.quantity) setQuantity(data.quantity);
                if (data.unit) setUnit(data.unit);
                if (data.category) setCategory(data.category);
                if (data.storage) setStorage(data.storage);
                if (data.expiryDate) setExpiryDate(data.expiryDate);
            }
        } catch (e) { console.error("Erro no processamento de voz", e); alert("Não entendi o comando de voz."); }
    };

    const handleCameraClick = () => {
        if (fileInputRef.current) fileInputRef.current.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsAnalyzingPhoto(true);
            try {
                const resizedImage = await compressImage(e.target.files[0]);
                setImage(resizedImage);
                
                // --- IMMEDIATE CALENDAR TRIGGER ---
                setShowDateModal(true); 
                // ----------------------------------

                // Start AI Analysis (Background)
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const base64Data = resizedImage.split(',')[1];
                
                // SIMPLIFIED PROMPT - No Expiry needed as user will set manually
                const prompt = `Analyze this product image to identify it. Return a JSON object with:
                {
                    "productName": "Brand and Name of product",
                    "quantity": "Net weight/volume if visible (e.g. 500g)"
                }`;

                const result = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: {
                        parts: [
                            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                            { text: prompt }
                        ]
                    },
                    config: { responseMimeType: "application/json" }
                });

                if (result.text) {
                    const aiData = JSON.parse(result.text);
                    let detectedName = aiData.productName || "";
                    let detectedQty = aiData.quantity || "";

                    if (detectedName) {
                        const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(detectedName)}&search_simple=1&action=process&json=1&page_size=1`;
                        try {
                            const offRes = await fetch(searchUrl);
                            const offData = await offRes.json();
                            if (offData.products && offData.products.length > 0) {
                                const p = offData.products[0];
                                detectedName = p.product_name || detectedName;
                                const offQty = p.quantity || p.product_quantity || (p.net_weight_value ? `${p.net_weight_value}${p.net_weight_unit || ''}` : '');
                                if (offQty) detectedQty = offQty;
                                if (p.code) setBarcode(p.code);
                                
                                const cat = smartCategorize(p.categories, detectedName);
                                setCategory(cat);
                            } else {
                                setCategory(smartCategorize("", detectedName));
                            }
                        } catch (err) {
                             setCategory(smartCategorize("", detectedName));
                        }
                    }

                    if (detectedName) setName(detectedName);
                    if (detectedQty) setQuantity(detectedQty);
                }

            } catch (error) {
                console.error("Image analysis error", error);
            } finally {
                setIsAnalyzingPhoto(false);
                // Clear input
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const handleAIClick = async () => {
        if (!name) return alert("Preencha o nome do produto primeiro.");
        setIsGeneratingImage(true);
        try {
            // Search OpenFoodFacts for REAL product images
            const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=1`;
            const response = await fetch(searchUrl);
            const data = await response.json();

            if (data.products && data.products.length > 0) {
                const product = data.products[0];
                const imageUrl = product.image_front_url || product.image_url;
                
                if (imageUrl) {
                    try {
                        const compressed = await compressImage(imageUrl);
                        setImage(compressed);
                    } catch (corsError) {
                         // Fallback if CORS fails: Use the URL directly
                         setImage(imageUrl);
                    }
                } else {
                     alert("Imagem real não encontrada para este produto.");
                }
            } else {
                alert("Produto real não encontrado na base de dados.");
            }
        } catch (error) {
            console.error("Search Error", error);
            alert("Erro ao buscar imagem.");
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const inputClass = `w-full mt-1 p-2 rounded-lg outline-none ${highContrast ? 'bg-black text-yellow-400 border-2 border-yellow-400' : (darkMode ? 'bg-zinc-700 text-white' : 'bg-white text-gray-800')}`;
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !category || !quantity || !expiryDate || !storage) { alert('Por favor, preencha todos os campos obrigatórios.'); return; }
        const parsedUnit = Number(unit) > 0 ? Number(unit) : 1;
        onAdd({ name, category, quantity, unit: parsedUnit, expiryDate: new Date(expiryDate).toISOString(), storage, notes, image, barcode });
    };

    const CategoryButton: FC<{ cKey: CategoryKey, selected: boolean, onClick: () => void }> = ({ cKey, selected, onClick }) => (
        <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${selected ? (highContrast ? 'bg-yellow-400 text-black font-bold' : 'bg-white/30') : (highContrast ? 'border border-yellow-400' : 'bg-white/10')}`}>
            <span className="text-2xl">{CATEGORIES[cKey].icon}</span>
            <span className="text-xs truncate w-full text-center">{CATEGORIES[cKey].label}</span>
        </button>
    );
    const StorageButton: FC<{ sKey: StorageKey, selected: boolean, onClick: () => void }> = ({ sKey, selected, onClick }) => (
        <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${selected ? (highContrast ? 'bg-yellow-400 text-black font-bold' : 'bg-white/30') : (highContrast ? 'border border-yellow-400' : 'bg-white/10')}`}>
            <span className="text-2xl">{STORAGE_TYPES[sKey].icon}</span>
            <span className="text-xs">{STORAGE_TYPES[sKey].label}</span>
        </button>
    );

    const imageContainerClass = highContrast ? 'border-2 border-yellow-400 bg-black' : (darkMode ? 'border-white/20 bg-white/10' : 'border-white bg-white shadow-md');

    return (
        <>
            <ModalWrapper onClose={onClose} title="Adicionar Produto" darkMode={darkMode} highContrast={highContrast}>
                <button type="button" onClick={toggleListening} className={`w-full py-3 mb-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${isListening ? 'animate-pulse bg-red-600 text-white' : 'bg-yellow-400 text-red-600'}`}>
                    <MicIcon className="w-5 h-5"/> {isListening ? 'Parar Gravação' : 'Preencher por Voz'}
                </button>
                
                {/* Hidden File Input */}
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />

                <div className="flex gap-4 items-center mb-4 bg-opacity-10 p-2 rounded-lg">
                    {image ? (
                        <div className={`w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 relative group ${imageContainerClass}`}>
                            <img src={image} alt="Produto" className="w-full h-full object-cover" />
                            <button onClick={() => setImage('')} className="absolute inset-0 bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <CloseIcon className="w-6 h-6"/>
                            </button>
                        </div>
                    ) : (
                        <div className={`w-20 h-20 rounded-xl flex flex-col overflow-hidden ${imageContainerClass}`}>
                            <button onClick={handleCameraClick} type="button" disabled={isAnalyzingPhoto} className={`flex-1 flex items-center justify-center transition-colors bg-yellow-300 hover:bg-yellow-400 text-red-600`}>
                                {isAnalyzingPhoto ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/> : <CameraIcon className="w-6 h-6"/>}
                            </button>
                            <button onClick={handleAIClick} type="button" disabled={isGeneratingImage} className={`flex-1 flex items-center justify-center transition-colors border-t border-black/10 bg-yellow-300 hover:bg-yellow-400 text-red-600`}>
                                {isGeneratingImage ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/> : <SparklesIcon className="w-6 h-6"/>}
                            </button>
                        </div>
                    )}
                    
                    <div className="flex-1 overflow-hidden">
                        {barcode && <div className={`text-xs font-bold uppercase tracking-wider mb-1 opacity-70 ${highContrast ? 'text-yellow-400' : 'text-white'}`}>CÓD: {barcode}</div>}
                        <div className="font-bold text-lg leading-tight truncate">{name || "Novo Produto"}</div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                    <div><label className="text-sm font-semibold">Nome do Produto</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Arroz Integral" className={inputClass} /></div>
                    <div><label className="text-sm font-semibold">Vencimento</label><input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={inputClass} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-sm font-semibold">Unidades</label><input type="number" min="1" value={unit} onChange={e => setUnit(e.target.value)} className={inputClass} /></div>
                        <div><label className="text-sm font-semibold">Peso/Vol</label><input type="text" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Ex: 500g, 1L" className={inputClass} /></div>
                    </div>
                    <div><label className="text-sm font-semibold">Categoria</label><div className="grid grid-cols-3 gap-2 mt-1">{(Object.keys(CATEGORIES) as CategoryKey[]).map(key => <CategoryButton key={key} cKey={key} selected={category === key} onClick={() => setCategory(key)} />)}</div></div>
                    <div><label className="text-sm font-semibold">Onde Guardar?</label><div className="grid grid-cols-4 gap-2 mt-1">{(Object.keys(STORAGE_TYPES) as StorageKey[]).map(key => <StorageButton key={key} sKey={key} selected={storage === key} onClick={() => setStorage(key)} />)}</div></div>
                    <div><label className="text-sm font-semibold">Observações (opcional)</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Prateleira de cima..." className={`${inputClass} h-16 resize-none`}></textarea></div>
                    <button type="submit" className={`w-full py-3 font-bold rounded-lg mt-4 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-white text-red-600'}`}>Salvar Produto</button>
                </form>
            </ModalWrapper>

            {/* OVERLAY DATE MODAL */}
            {showDateModal && (
                <DateSelectionModal 
                    onClose={() => setShowDateModal(false)} 
                    onConfirm={(date) => {
                        setExpiryDate(date);
                        setShowDateModal(false);
                    }}
                    darkMode={darkMode}
                    highContrast={highContrast}
                />
            )}
        </>
    );
};

const EditProductModal: FC<{ product: Product, onClose: () => void, onUpdate: (product: Product) => void, darkMode?: boolean, highContrast?: boolean }> = ({ product, onClose, onUpdate, darkMode, highContrast }) => {
    const [name, setName] = useState(product.name);
    const [category, setCategory] = useState<CategoryKey>(product.category);
    const [quantity, setQuantity] = useState(product.quantity);
    const [unit, setUnit] = useState<string | number>(product.unit || 1); 
    const [expiryDate, setExpiryDate] = useState(product.expiryDate.split('T')[0]);
    const [storage, setStorage] = useState<StorageKey>(product.storage);
    const [notes, setNotes] = useState(product.notes || '');
    const [image, setImage] = useState(product.image || '');
    const [isListening, setIsListening] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);

    // Voice Recognition Refs
    const recognitionRef = useRef<any>(null);
    const accumulatedTextRef = useRef<string>("");
    const shouldStopRef = useRef(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const inputClass = `w-full mt-1 p-2 rounded-lg outline-none ${highContrast ? 'bg-black text-yellow-400 border-2 border-yellow-400' : (darkMode ? 'bg-zinc-700 text-white' : 'bg-white text-gray-800')}`;

    // Calendar trigger
    const [showDateModal, setShowDateModal] = useState(false);

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                shouldStopRef.current = true; // Ensure it doesn't restart
                recognitionRef.current.abort(); // Force stop
            }
        };
    }, []);

    const toggleListening = () => {
        if (isListening) {
            // Manual Stop
            shouldStopRef.current = true;
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        } else {
            // Start
            shouldStopRef.current = false;
            accumulatedTextRef.current = "";
            startListening();
        }
    };

    const startListening = () => {
        if (!('webkitSpeechRecognition' in window)) {
            alert("Seu navegador não suporta reconhecimento de voz.");
            return;
        }
        
        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.lang = 'pt-BR';
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    accumulatedTextRef.current += event.results[i][0].transcript + " ";
                }
            }
        };

        recognition.onerror = (event: any) => {
             console.error("Speech recognition error", event.error);
             if (event.error === 'not-allowed') {
                 shouldStopRef.current = true;
                 setIsListening(false);
                 alert("Acesso ao microfone negado. Por favor, permita o acesso.");
             }
        };

        recognition.onend = () => {
            if (!shouldStopRef.current) {
                try {
                    recognition.start();
                } catch (e) {
                    setIsListening(false);
                }
                return;
            }

            setIsListening(false);
            if (accumulatedTextRef.current.trim().length > 0) {
                processVoiceCommand(accumulatedTextRef.current);
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    const processVoiceCommand = async (text: string) => {
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const today = new Date().toISOString().split('T')[0];
            const prompt = `Analise este comando de voz para editar produto: "${text}".
            Hoje é ${today}.
            Extraia os dados em JSON (apenas os mencionados):
            {
                "name": string,
                "quantity": string,
                "unit": number,
                "category": string,
                "storage": string,
                "expiryDate": string
            }`;
            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
            if (response.text) {
                const data = JSON.parse(response.text);
                if (data.name) setName(data.name);
                if (data.quantity) setQuantity(data.quantity);
                if (data.unit) setUnit(data.unit);
                if (data.category) setCategory(data.category);
                if (data.storage) setStorage(data.storage);
                if (data.expiryDate) setExpiryDate(data.expiryDate);
            }
        } catch (e) { console.error("Erro no processamento de voz", e); alert("Não entendi o comando de voz."); }
    };

    const handleCameraClick = () => { if (fileInputRef.current) fileInputRef.current.click(); };
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsAnalyzingPhoto(true);
            try {
                const resizedImage = await compressImage(e.target.files[0]);
                setImage(resizedImage);
                
                // --- IMMEDIATE CALENDAR TRIGGER ---
                setShowDateModal(true);
                // ----------------------------------

                // Smart Camera Analysis
                const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
                const base64Data = resizedImage.split(',')[1];
                
                const prompt = `Analyze this product image to identify it. Return a JSON object with:
                {
                    "productName": "Brand and Name of product",
                    "quantity": "Net weight/volume if visible (e.g. 500g)"
                }`;

                const result = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: {
                        parts: [
                            { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                            { text: prompt }
                        ]
                    },
                    config: { responseMimeType: "application/json" }
                });

                if (result.text) {
                    const aiData = JSON.parse(result.text);
                    let detectedName = aiData.productName || "";
                    let detectedQty = aiData.quantity || "";

                    if (detectedName) {
                        const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(detectedName)}&search_simple=1&action=process&json=1&page_size=1`;
                        try {
                            const offRes = await fetch(searchUrl);
                            const offData = await offRes.json();
                            if (offData.products && offData.products.length > 0) {
                                const p = offData.products[0];
                                detectedName = p.product_name || detectedName;
                                const offQty = p.quantity || p.product_quantity || (p.net_weight_value ? `${p.net_weight_value}${p.net_weight_unit || ''}` : '');
                                if (offQty) detectedQty = offQty;
                                const cat = smartCategorize(p.categories, detectedName);
                                setCategory(cat);
                            } else {
                                setCategory(smartCategorize("", detectedName));
                            }
                        } catch (err) {
                             setCategory(smartCategorize("", detectedName));
                        }
                    }

                    if (detectedName) setName(detectedName);
                    if (detectedQty) setQuantity(detectedQty);
                }
            } catch (error) {
                console.error("Image analysis error", error);
            } finally {
                setIsAnalyzingPhoto(false);
                if(fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };
    
    const handleAIClick = async () => {
        if (!name) return alert("Preencha o nome do produto primeiro.");
        setIsGeneratingImage(true);
        try {
            // Search OpenFoodFacts for REAL product images
            const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=1`;
            const response = await fetch(searchUrl);
            const data = await response.json();

            if (data.products && data.products.length > 0) {
                const product = data.products[0];
                const imageUrl = product.image_front_url || product.image_url;
                
                if (imageUrl) {
                    try {
                        const compressed = await compressImage(imageUrl);
                        setImage(compressed);
                    } catch (corsError) {
                         // Fallback if CORS fails: Use the URL directly
                         setImage(imageUrl);
                    }
                } else {
                     alert("Imagem real não encontrada para este produto.");
                }
            } else {
                alert("Produto real não encontrado na base de dados.");
            }
        } catch (error) {
            console.error("Search Error", error);
            alert("Erro ao buscar imagem.");
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !category || !quantity || !expiryDate || !storage) { alert('Por favor, preencha todos os campos obrigatórios.'); return; }
        const parsedUnit = Number(unit) > 0 ? Number(unit) : 1;
        onUpdate({ ...product, name, category, quantity, unit: parsedUnit, expiryDate: new Date(expiryDate).toISOString(), storage, notes, image });
    };

    const CategoryButton: FC<{ cKey: CategoryKey, selected: boolean, onClick: () => void }> = ({ cKey, selected, onClick }) => (
        <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${selected ? (highContrast ? 'bg-yellow-400 text-black font-bold' : 'bg-white/30') : (highContrast ? 'border border-yellow-400' : 'bg-white/10')}`}>
            <span className="text-2xl">{CATEGORIES[cKey].icon}</span>
            <span className="text-xs">{CATEGORIES[cKey].label}</span>
        </button>
    );
    const StorageButton: FC<{ sKey: StorageKey, selected: boolean, onClick: () => void }> = ({ sKey, selected, onClick }) => (
        <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${selected ? (highContrast ? 'bg-yellow-400 text-black font-bold' : 'bg-white/30') : (highContrast ? 'border border-yellow-400' : 'bg-white/10')}`}>
            <span className="text-2xl">{STORAGE_TYPES[sKey].icon}</span>
            <span className="text-xs">{STORAGE_TYPES[sKey].label}</span>
        </button>
    );
    const imageContainerClass = highContrast ? 'border-2 border-yellow-400 bg-black' : (darkMode ? 'border-white/20 bg-white/10' : 'border-white bg-white shadow-md');

    return (
        <>
            <ModalWrapper onClose={onClose} title="Editar Produto" darkMode={darkMode} highContrast={highContrast}>
                <button type="button" onClick={toggleListening} className={`w-full py-3 mb-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all ${isListening ? 'animate-pulse bg-red-600 text-white' : 'bg-yellow-400 text-red-600'}`}>
                    <MicIcon className="w-5 h-5"/> {isListening ? 'Parar Gravação' : 'Preencher por Voz'}
                </button>

                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />

                <div className="flex gap-4 items-center mb-4 bg-opacity-10 p-2 rounded-lg">
                    {image ? (
                        <div className={`w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 relative group ${imageContainerClass}`}>
                            <img src={image} alt="Produto" className="w-full h-full object-cover" />
                            <button onClick={() => setImage('')} className="absolute inset-0 bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <CloseIcon className="w-6 h-6"/>
                            </button>
                        </div>
                    ) : (
                        <div className={`w-20 h-20 rounded-xl flex flex-col overflow-hidden ${imageContainerClass}`}>
                            <button onClick={handleCameraClick} type="button" disabled={isAnalyzingPhoto} className={`flex-1 flex items-center justify-center transition-colors bg-yellow-300 hover:bg-yellow-400 text-red-600`}>
                                {isAnalyzingPhoto ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/> : <CameraIcon className="w-6 h-6"/>}
                            </button>
                            <button onClick={handleAIClick} type="button" disabled={isGeneratingImage} className={`flex-1 flex items-center justify-center transition-colors border-t border-black/10 bg-yellow-300 hover:bg-yellow-400 text-red-600`}>
                                {isGeneratingImage ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"/> : <SparklesIcon className="w-6 h-6"/>}
                            </button>
                        </div>
                    )}
                    <div className="flex-1 font-bold text-lg leading-tight truncate self-center">{name || "Produto Existente"}</div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    <div><label className="text-sm font-semibold">Nome do Produto</label><input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} /></div>
                    <div><label className="text-sm font-semibold">Categoria</label><div className="grid grid-cols-3 gap-2 mt-1">{(Object.keys(CATEGORIES) as CategoryKey[]).map(key => <CategoryButton key={key} cKey={key} selected={category === key} onClick={() => setCategory(key)} />)}</div></div>
                    <div><label className="text-sm font-semibold">Data de Validade</label><input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className={inputClass} /></div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-sm font-semibold">Unidades</label><input type="number" min="1" value={unit} onChange={e => setUnit(e.target.value)} className={inputClass} /></div>
                        <div><label className="text-sm font-semibold">Peso/Vol</label><input type="text" value={quantity} onChange={e => setQuantity(e.target.value)} className={inputClass} /></div>
                    </div>
                    <div><label className="text-sm font-semibold">Tipo de Armazenamento</label><div className="grid grid-cols-4 gap-2 mt-1">{(Object.keys(STORAGE_TYPES) as StorageKey[]).map(key => <StorageButton key={key} sKey={key} selected={storage === key} onClick={() => setStorage(key)} />)}</div></div>
                    <div><label className="text-sm font-semibold">Observações (opcional)</label><textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClass} h-20 resize-none`}></textarea></div>
                    <button type="submit" className={`w-full py-3 font-bold rounded-lg mt-4 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-white text-red-600'}`}>Salvar Alterações</button>
                </form>
            </ModalWrapper>

            {/* OVERLAY DATE MODAL */}
            {showDateModal && (
                <DateSelectionModal 
                    onClose={() => setShowDateModal(false)} 
                    onConfirm={(date) => {
                        setExpiryDate(date);
                        setShowDateModal(false);
                    }}
                    darkMode={darkMode}
                    highContrast={highContrast}
                />
            )}
        </>
    );
};

const AddShoppingItemModal: FC<{ onClose: () => void, onAdd: (item: Omit<ShoppingItem, 'id' | 'checked'>) => void, darkMode?: boolean, highContrast?: boolean }> = ({ onClose, onAdd, darkMode, highContrast }) => {
    const [name, setName] = useState('');
    const [category, setCategory] = useState<CategoryKey | null>(null);
    const [quantity, setQuantity] = useState('');
    const [estimatedPrice, setEstimatedPrice] = useState('');
    const [notes, setNotes] = useState('');
    const [isSuggesting, setIsSuggesting] = useState(false);
    
    const inputClass = `w-full mt-1 p-2 rounded-lg outline-none ${highContrast ? 'bg-black text-yellow-400 border-2 border-yellow-400' : (darkMode ? 'bg-zinc-700 text-white' : 'bg-white text-gray-800')}`;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !category || !quantity) {
             alert('Por favor, preencha nome, categoria e quantidade.');
             return;
        }
        onAdd({ name, category, quantity, estimatedPrice, notes });
    };

    const handleSuggestPrice = async () => {
        if (!name) return alert("Preencha o nome do produto primeiro.");
        setIsSuggesting(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            
            const prompt = `Atue como um pesquisador de preços. Busque o valor atual de mercado no Brasil para o item exato: "${name}". 
            Considere "${name}" como a marca ou descrição oficial do produto.
            ${quantity ? `Quantidade/Volume: ${quantity}.` : ''}
            Ignore receitas, busque apenas produtos vendidos em mercados.
            Retorne APENAS o valor numérico (ex: 15.90). Sem texto.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                },
            });

            if (response.text) {
                const cleanText = response.text.replace('R$', '').trim();
                const match = cleanText.match(/(\d+[.,]?\d*)/);
                if (match) {
                    const price = match[0].replace(',', '.');
                    setEstimatedPrice(price);
                } else {
                     setEstimatedPrice(cleanText); // Fallback
                }
            }
        } catch (e) {
            console.error("Erro ao sugerir preço", e);
            alert("Não foi possível pesquisar o preço no momento.");
        } finally {
            setIsSuggesting(false);
        }
    };

    const CategoryButton: FC<{ cKey: CategoryKey, selected: boolean, onClick: () => void }> = ({ cKey, selected, onClick }) => (
        <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${selected ? (highContrast ? 'bg-yellow-400 text-black font-bold' : 'bg-white/30') : (highContrast ? 'border border-yellow-400' : 'bg-white/10')}`}>
            <span className="text-2xl">{CATEGORIES[cKey].icon}</span>
            <span className="text-xs">{CATEGORIES[cKey].label}</span>
        </button>
    );
    
    return (
        <ModalWrapper onClose={onClose} title="Adicionar à Lista" darkMode={darkMode} highContrast={highContrast}>
             <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                    <label className="text-sm font-semibold">Nome do Item</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Leite Integral" className={inputClass} />
                </div>
                <div>
                    <label className="text-sm font-semibold">Categoria</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                        {(Object.keys(CATEGORIES) as CategoryKey[]).slice(0,6).map(key => <CategoryButton key={key} cKey={key} selected={category === key} onClick={() => setCategory(key)} />)}
                    </div>
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-semibold">Quantidade</label>
                        <input type="text" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Ex: 2kg, 1L, 5 uni" className={inputClass} />
                    </div>
                    <div>
                        <label className="text-sm font-semibold">Preço Estimado (R$)</label>
                        <div className="relative">
                            <input type="text" value={estimatedPrice} onChange={e => setEstimatedPrice(e.target.value)} placeholder="Ex: 5.90" className={inputClass} />
                            <button 
                                type="button" 
                                onClick={handleSuggestPrice} 
                                className="absolute right-1 top-1 bottom-1 px-2 bg-yellow-400 text-black text-xs font-bold rounded shadow-sm hover:bg-yellow-500 transition-colors flex items-center gap-1"
                                disabled={isSuggesting}
                            >
                                {isSuggesting ? '...' : '✨ Sugerir'}
                            </button>
                        </div>
                    </div>
                </div>
                <div>
                    <label className="text-sm font-semibold">Observações (opcional)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: Marca específica, promoção..." className={`${inputClass} h-20 resize-none`}></textarea>
                </div>
                <button type="submit" className={`w-full py-3 font-bold rounded-lg mt-4 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-white text-red-600'}`}>Adicionar à Lista</button>
            </form>
        </ModalWrapper>
    );
};

const EditShoppingItemModal: FC<{ item: ShoppingItem, onClose: () => void, onUpdate: (item: ShoppingItem) => void, darkMode?: boolean, highContrast?: boolean }> = ({ item, onClose, onUpdate, darkMode, highContrast }) => {
    const [name, setName] = useState(item.name);
    const [category, setCategory] = useState<CategoryKey>(item.category);
    const [quantity, setQuantity] = useState(item.quantity);
    const [estimatedPrice, setEstimatedPrice] = useState(item.estimatedPrice || '');
    const [notes, setNotes] = useState(item.notes || '');
    const [isSuggesting, setIsSuggesting] = useState(false);
    
    const inputClass = `w-full mt-1 p-2 rounded-lg outline-none ${highContrast ? 'bg-black text-yellow-400 border-2 border-yellow-400' : (darkMode ? 'bg-zinc-700 text-white' : 'bg-white text-gray-800')}`;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !category || !quantity) {
             alert('Por favor, preencha nome, categoria e quantidade.');
             return;
        }
        onUpdate({ ...item, name, category, quantity, estimatedPrice, notes });
    };

    const handleSuggestPrice = async () => {
        if (!name) return alert("Preencha o nome do produto primeiro.");
        setIsSuggesting(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            
            const prompt = `Atue como um pesquisador de preços. Busque o valor atual de mercado no Brasil para o item exato: "${name}". 
            Considere "${name}" como a marca ou descrição oficial do produto.
            ${quantity ? `Quantidade/Volume: ${quantity}.` : ''}
            Ignore receitas, busque apenas produtos vendidos em mercados.
            Retorne APENAS o valor numérico (ex: 15.90). Sem texto.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                },
            });

            if (response.text) {
                const cleanText = response.text.replace('R$', '').trim();
                const match = cleanText.match(/(\d+[.,]?\d*)/);
                if (match) {
                    const price = match[0].replace(',', '.');
                    setEstimatedPrice(price);
                } else {
                     setEstimatedPrice(cleanText);
                }
            }
        } catch (e) {
            console.error("Erro ao sugerir preço", e);
            alert("Não foi possível pesquisar o preço no momento.");
        } finally {
            setIsSuggesting(false);
        }
    };

    const CategoryButton: FC<{ cKey: CategoryKey, selected: boolean, onClick: () => void }> = ({ cKey, selected, onClick }) => (
        <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${selected ? (highContrast ? 'bg-yellow-400 text-black font-bold' : 'bg-white/30') : (highContrast ? 'border border-yellow-400' : 'bg-white/10')}`}>
            <span className="text-2xl">{CATEGORIES[cKey].icon}</span>
            <span className="text-xs">{CATEGORIES[cKey].label}</span>
        </button>
    );
    
    return (
        <ModalWrapper onClose={onClose} title="Editar Item" darkMode={darkMode} highContrast={highContrast}>
             <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <div>
                    <label className="text-sm font-semibold">Nome do Item</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
                </div>
                <div>
                    <label className="text-sm font-semibold">Categoria</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                        {(Object.keys(CATEGORIES) as CategoryKey[]).slice(0,6).map(key => <CategoryButton key={key} cKey={key} selected={category === key} onClick={() => setCategory(key)} />)}
                    </div>
                </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-semibold">Quantidade</label>
                        <input type="text" value={quantity} onChange={e => setQuantity(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label className="text-sm font-semibold">Preço Estimado (R$)</label>
                        <div className="relative">
                            <input type="text" value={estimatedPrice} onChange={e => setEstimatedPrice(e.target.value)} className={inputClass} />
                            <button 
                                type="button" 
                                onClick={handleSuggestPrice} 
                                className="absolute right-1 top-1 bottom-1 px-2 bg-yellow-400 text-black text-xs font-bold rounded shadow-sm hover:bg-yellow-500 transition-colors flex items-center gap-1"
                                disabled={isSuggesting}
                            >
                                {isSuggesting ? '...' : '✨ Sugerir'}
                            </button>
                        </div>
                    </div>
                </div>
                <div>
                    <label className="text-sm font-semibold">Observações (opcional)</label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputClass} h-20 resize-none`}></textarea>
                </div>
                <button type="submit" className={`w-full py-3 font-bold rounded-lg mt-4 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-white text-red-600'}`}>Salvar Alterações</button>
            </form>
        </ModalWrapper>
    );
};

const ScreenWrapper: FC<{children: React.ReactNode, className?: string, darkMode?: boolean, highContrast?: boolean}> = ({ children, className, darkMode, highContrast }) => (
    <div className={`w-full h-full flex flex-col ${highContrast ? 'bg-black text-yellow-400' : (darkMode ? 'bg-zinc-900 text-white' : 'bg-gradient-to-b from-yellow-100 to-red-200 text-gray-800')} ${className}`}>
        {children}
    </div>
);

const SplashScreen: FC = () => (
    <div className="w-full h-full flex flex-col justify-center items-center bg-gradient-to-br from-yellow-300 via-yellow-100 to-white">
        <h1 className="text-6xl font-bold text-red-500 flex items-center gap-4 animate-pop-in">
             <span className="text-5xl">🛍️</span> FooID <span className="text-5xl">🛒</span>
        </h1>
        <div className="mt-8 flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-red-500 font-semibold animate-pulse text-sm">Carregando...</span>
        </div>
    </div>
);

const WelcomeScreen: FC<{onNavigate: (s: Screen) => void}> = ({ onNavigate }) => (
     <div className="w-full h-full flex flex-col justify-center items-center p-8 bg-gradient-to-br from-yellow-300 via-yellow-100 to-white text-gray-800">
        <h1 className="text-6xl font-bold text-red-500 flex items-center gap-4 mb-20 drop-shadow-sm animate-pop-in">
             <span className="text-5xl">🛍️</span> FooID <span className="text-5xl">🛒</span>
        </h1>
        <div className="w-full max-w-xs space-y-6">
            <button onClick={() => onNavigate('login')} className="w-full py-3.5 px-4 bg-white text-red-800 font-bold text-lg rounded-full shadow-lg border border-red-800 hover:bg-red-50 transition duration-300">Entrar</button>
            <button onClick={() => onNavigate('register')} className="w-full py-3.5 px-4 bg-white text-red-800 font-bold text-lg rounded-full shadow-lg border border-red-800 hover:bg-red-50 transition duration-300">Criar Conta</button>
        </div>
    </div>
);

const SocialButton: FC<{icon: React.ReactNode, label: string, onClick?: (e: React.MouseEvent) => void, isLoading?: boolean}> = ({icon, label, onClick, isLoading}) => (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (onClick && !isLoading) onClick(e); }} disabled={isLoading} className={`w-full py-2.5 bg-white/80 backdrop-blur-sm hover:bg-white border border-white/50 rounded-lg flex items-center justify-center gap-3 shadow-sm transition-all mb-3 ${isLoading ? 'opacity-70 cursor-wait' : ''}`}>
        {isLoading ? (
            <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
        ) : (
            <div className="w-5 h-5">{icon}</div>
        )}
        <span className="text-gray-700 text-sm font-medium">{isLoading ? 'Aguarde...' : label}</span>
    </button>
);

const LoginScreen: FC<{onNavigate: (s: Screen) => void, onGoogleSignIn: () => Promise<void>, darkMode?: boolean, highContrast?: boolean}> = ({ onNavigate, onGoogleSignIn, darkMode, highContrast }) => {
    const [isForgotModalOpen, setForgotModalOpen] = useState(false);
    const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isGoogleLoading, setGoogleLoading] = useState(false);

    const handleGoogleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        setGoogleLoading(true);
        try {
            await onGoogleSignIn();
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error: any) {
            console.error("Login error:", error);
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                alert("Email ou senha incorretos.");
            } else if (error.code === 'auth/too-many-requests') {
                alert("Muitas tentativas. Tente novamente mais tarde.");
            } else {
                alert("Ocorreu um erro ao fazer login. Verifique sua conexão.");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRecovery = async (email: string) => {
        try {
            await sendPasswordResetEmail(auth, email);
            setRecoveryMessage(`Link de recuperação enviado para: ${email}`);
            setForgotModalOpen(false);
            setTimeout(() => setRecoveryMessage(null), 4000);
        } catch (error: any) {
            alert("Erro ao enviar email de recuperação. Verifique o email informado.");
        }
    };

    return (
         <div className="w-full h-full flex flex-col justify-center items-center p-4 bg-gradient-to-br from-yellow-300 via-yellow-100 to-white overflow-y-auto text-gray-800">
            
            {/* Success Toast */}
            {recoveryMessage && (
                <div className="fixed top-10 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-6 py-3 rounded-full shadow-xl z-50 animate-slide-in-top font-bold flex items-center gap-2">
                    <span className="text-xl">✅</span>
                    <span>{recoveryMessage}</span>
                </div>
            )}

            <div className="w-full max-w-md bg-gradient-to-b from-red-100 to-red-500 p-6 rounded-3xl shadow-2xl relative">
                 
                <h1 className="text-3xl font-bold text-red-600 text-center mb-6">Entrar</h1>
                
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-gray-700 ml-1">Email</label>
                        <input 
                            type="email" 
                            placeholder="Digite seu email" 
                            className="w-full p-3 bg-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-red-300 text-sm text-gray-800" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-700 ml-1">Senha</label>
                        <input 
                            type="password" 
                            placeholder="Digite sua senha" 
                            className="w-full p-3 bg-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-red-300 text-sm text-gray-800" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required 
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-3 mt-4 bg-red-400 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg transform active:scale-95 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Entrando...' : 'Entrar'}
                    </button>
                </form>

                <div className="flex items-center gap-2 my-6">
                    <div className="h-px bg-white/50 flex-1"></div>
                    <span className="text-xs font-bold text-white/90 bg-red-400/20 px-2 py-1 rounded">ou entre com</span>
                    <div className="h-px bg-white/50 flex-1"></div>
                </div>

                <div className="mb-4">
                    <SocialButton icon={<GoogleIcon />} label="Entrar com Google" onClick={handleGoogleClick} isLoading={isGoogleLoading} />
                </div>
                <div className="mt-6 flex flex-col gap-3 text-center">
                    <button onClick={() => setForgotModalOpen(true)} className="text-xs font-semibold text-white/90 hover:text-white underline">
                        Esqueci minha senha
                    </button>
                    <button onClick={() => onNavigate('register')} className="text-sm font-bold text-black underline decoration-1 underline-offset-2 hover:text-white transition-colors">
                        Não tem uma conta? Cadastre-se
                    </button>
                </div>
            </div>
            {isForgotModalOpen && (
                <ForgotPasswordModal 
                    onClose={() => setForgotModalOpen(false)} 
                    onSend={handleRecovery} 
                    darkMode={darkMode} 
                    highContrast={highContrast} 
                />
            )}
        </div>
    );
};

const RegisterScreen: FC<{onNavigate: (s: Screen) => void, onGoogleSignIn: () => Promise<void>}> = ({ onNavigate, onGoogleSignIn }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [isGoogleLoading, setGoogleLoading] = useState(false);

    const handleGoogleClick = async (e: React.MouseEvent) => {
        e.preventDefault();
        setGoogleLoading(true);
        try {
            await onGoogleSignIn();
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            alert("As senhas não coincidem.");
            return;
        }
        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            
            // Update Auth Profile
            await updateProfile(user, { displayName: name });

            // Save to Firestore
            await setDoc(doc(db, 'users', user.uid), {
                name,
                email,
                createdAt: serverTimestamp()
            });

        } catch (error: any) {
            console.error("Registration error:", error);
            if (error.code === 'auth/email-already-in-use') {
                alert("Este e-mail já está em uso.");
            } else if (error.code === 'auth/weak-password') {
                alert("A senha deve ter pelo menos 6 caracteres.");
            } else {
                alert("Erro ao criar conta. Tente novamente.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
         <div className="w-full h-full flex flex-col justify-center items-center p-4 bg-gradient-to-br from-yellow-300 via-yellow-100 to-white overflow-y-auto text-gray-800">
            
            <div className="w-full max-w-md bg-gradient-to-b from-red-100 to-red-500 p-6 rounded-3xl shadow-2xl relative">
                 
                <h1 className="text-3xl font-bold text-red-600 text-center mb-6">Criar Conta</h1>
                
                <div className="mb-4">
                    <p className="text-xs text-center text-gray-600 mb-3">Entre com suas redes sociais</p>
                    <SocialButton icon={<GoogleIcon />} label="Continuar com Google" onClick={handleGoogleClick} isLoading={isGoogleLoading} />
                    <SocialButton icon={<FacebookIcon className="text-blue-600"/>} label="Continuar com Facebook" />
                    <SocialButton icon={<AppleIcon className="text-black"/>} label="Continuar com Apple ID" />
                </div>

                <div className="flex items-center gap-2 mb-6">
                    <div className="h-px bg-white/50 flex-1"></div>
                    <span className="text-xs font-bold text-white/90 bg-red-400/20 px-2 py-1 rounded">ou cadastre-se com email</span>
                    <div className="h-px bg-white/50 flex-1"></div>
                </div>

                <form onSubmit={handleRegister} className="space-y-3">
                    <div>
                        <label className="text-xs font-semibold text-gray-700 ml-1">Nome Completo</label>
                        <input 
                            type="text" 
                            placeholder="Digite seu nome completo" 
                            className="w-full p-3 bg-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-red-300 text-sm text-gray-800" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-700 ml-1">Email</label>
                        <input 
                            type="email" 
                            placeholder="Digite seu email" 
                            className="w-full p-3 bg-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-red-300 text-sm text-gray-800" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-700 ml-1">Senha</label>
                        <input 
                            type="password" 
                            placeholder="Digite sua senha" 
                            className="w-full p-3 bg-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-red-300 text-sm text-gray-800" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required 
                        />
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-700 ml-1">Confirmar Senha</label>
                        <input 
                            type="password" 
                            placeholder="Confirme sua senha" 
                            className="w-full p-3 bg-white rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-red-300 text-sm text-gray-800" 
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required 
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full py-3 mt-4 bg-red-400 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg transform active:scale-95 transition-all disabled:opacity-50"
                    >
                        {loading ? 'Criando Conta...' : 'Criar Conta'}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button onClick={() => onNavigate('login')} className="text-sm font-bold text-black underline decoration-1 underline-offset-2 hover:text-white transition-colors">
                        Já tem uma conta? Faça login
                    </button>
                </div>
            </div>
        </div>
    );
};

const Sidebar: FC<{ isOpen: boolean; onClose: () => void; onNavigate: (s: Screen) => void, darkMode?: boolean, highContrast?: boolean, deferredPrompt?: any, onInstallClick?: () => void }> = ({ isOpen, onClose, onNavigate, darkMode, highContrast, deferredPrompt, onInstallClick }) => {
    const navigateAndClose = (screen: Screen) => {
        onNavigate(screen);
        onClose();
    };

    const NavItem: FC<{ icon: React.ReactElement<{ className?: string }>; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
        <button onClick={onClick} className={`w-full flex items-center gap-4 p-3 rounded-lg transition-colors ${highContrast ? 'text-yellow-400 hover:bg-yellow-900' : (darkMode ? 'text-white hover:bg-zinc-700' : 'text-gray-700 hover:bg-white/50')}`}>
            {React.cloneElement(icon, { className: 'w-6 h-6' })}
            <span className="font-semibold">{label}</span>
        </button>
    );

    return (
        <>
            <div 
                className={`fixed inset-0 bg-black bg-opacity-40 z-30 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
                aria-hidden="true"
            />
            <aside className={`fixed top-0 left-0 h-full w-72 shadow-2xl z-40 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'} ${highContrast ? 'bg-black border-r-2 border-yellow-400' : (darkMode ? 'bg-zinc-800' : 'bg-gradient-to-b from-yellow-100 to-red-200')}`}>
                <div className={`p-4 flex justify-between items-center border-b ${highContrast ? 'border-yellow-400' : (darkMode ? 'border-zinc-700' : 'border-white/30')}`}>
                     <div className="text-left">
                        <h1 className={`text-xl font-bold flex items-center gap-2 ${highContrast ? 'text-yellow-400' : 'text-red-500'}`}>
                           <span className="text-xl">🛍️</span>FooID<span className="text-xl">🛒</span>
                        </h1>
                        <p className={`text-xs ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-400' : 'text-gray-600')}`}>Gerenciador de Despensa</p>
                     </div>
                     <button onClick={onClose} aria-label="Close menu"><CloseIcon className={`w-6 h-6 ${highContrast ? 'text-yellow-400' : 'text-red-500'}`}/></button>
                </div>
                <nav className="p-4 flex flex-col gap-2">
                    <NavItem icon={<PantryIcon />} label="Meus Produtos" onClick={() => navigateAndClose('pantry')} />
                    <NavItem icon={<CameraIcon />} label="Leitor QR/Código de Barras" onClick={() => navigateAndClose('scanner')} />
                    <NavItem icon={<BellIcon />} label="Notificações" onClick={() => navigateAndClose('notifications')} />
                    <NavItem icon={<ShoppingListIcon />} label="Lista de Compras" onClick={() => navigateAndClose('shoppingList')} />
                    <NavItem icon={<RecipeIcon />} label="Receitas" onClick={() => navigateAndClose('recipes')} />
                    <NavItem icon={<SettingsIcon />} label="Configurações" onClick={() => navigateAndClose('settings')} />
                    
                    {deferredPrompt && (
                        <button 
                            onClick={onInstallClick} 
                            className={`w-full flex items-center gap-4 p-3 rounded-lg transition-colors mt-4 border border-dashed ${highContrast ? 'text-yellow-400 border-yellow-400 hover:bg-yellow-900' : 'text-blue-600 border-blue-400 bg-blue-50 hover:bg-blue-100'}`}
                        >
                            <span className="text-xl">📲</span>
                            <span className="font-bold">Instalar App</span>
                        </button>
                    )}
                </nav>
            </aside>
        </>
    );
};

const Header: FC<{onToggleSidebar: () => void, onNavigate: (s: Screen) => void, onLogout: () => void, darkMode?: boolean, highContrast?: boolean}> = ({onToggleSidebar, onNavigate, onLogout, darkMode, highContrast}) => {
    const [isMenuOpen, setMenuOpen] = useState(false);
    return (
        <header className={`relative p-4 flex justify-between items-center ${highContrast ? 'bg-black border-b-2 border-yellow-400' : (darkMode ? 'bg-zinc-900 border-b border-zinc-800' : 'bg-gradient-to-r from-yellow-200 via-yellow-100 to-red-50')}`}>
            <button onClick={onToggleSidebar} aria-label="Open menu"><MenuIcon className={`w-7 h-7 ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-600')}`}/></button>
            <h1 className={`text-2xl font-bold flex items-center gap-2 ${highContrast ? 'text-yellow-400' : 'text-red-500'}`}>
                <span className="text-2xl">🛍️</span>FooID<span className="text-2xl">🛒</span>
            </h1>
            <div className="relative">
                <button onClick={() => setMenuOpen(!isMenuOpen)} aria-label="Open user menu"><UserIcon className={`w-7 h-7 ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-600')}`}/></button>
                {isMenuOpen && (
                    <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-xl z-20 py-1 ${highContrast ? 'bg-black border-2 border-yellow-400' : (darkMode ? 'bg-zinc-800 border border-zinc-700' : 'bg-white')}`}>
                        <button onClick={() => { onNavigate('editProfile'); setMenuOpen(false); }} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${highContrast ? 'text-yellow-400 hover:bg-yellow-900' : (darkMode ? 'text-gray-200 hover:bg-zinc-700' : 'text-gray-700 hover:bg-red-50')}`}>
                            <PencilIcon className="w-4 h-4" /> Alterar Perfil
                        </button>
                        <button onClick={onLogout} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${highContrast ? 'text-yellow-400 hover:bg-yellow-900' : (darkMode ? 'text-gray-200 hover:bg-zinc-700' : 'text-gray-700 hover:bg-red-50')}`}>
                           <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                           Logout
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
};

const DashboardScreen: FC<{onNavigate: (s: Screen) => void, onLogout: () => void, onToggleSidebar: () => void, notifications: Notification[], darkMode?: boolean, highContrast?: boolean}> = ({ onNavigate, onLogout, onToggleSidebar, notifications, darkMode, highContrast }) => {
    const [currentToast, setCurrentToast] = useState<Notification | null>(null);
    const toastableNotifications = useMemo(() => notifications.filter(n => !n.read && (n.type === 'expiry-soon' || n.type === 'expired' || n.type === 'low-stock')), [notifications]);

    useEffect(() => {
        if (toastableNotifications.length === 0) return;
        let currentIndex = -1;
        const showNextToast = () => {
            currentIndex = (currentIndex + 1) % toastableNotifications.length;
            setCurrentToast(toastableNotifications[currentIndex]);
        };
        const initialTimeout = setTimeout(showNextToast, 500);
        // REDUCED BY 3 SECONDS (10000 -> 7000)
        const intervalId = setInterval(showNextToast, 7000);
        return () => { clearTimeout(initialTimeout); clearInterval(intervalId); };
    }, [toastableNotifications]);

    const getToastStyles = (type: NotificationType) => {
        if (highContrast) return { container: 'bg-black border-2 border-l-4 border-yellow-400 text-yellow-400', icon: 'bg-yellow-400 text-black', textTitle: 'text-yellow-400', textBody: 'text-yellow-200', close: 'text-yellow-400' };
        if (darkMode) {
             switch (type) {
                case 'expired': return { container: 'bg-red-900/80 border-red-700 border-l-red-500 text-white', icon: 'bg-red-500/20 text-red-500', textTitle: 'text-white', textBody: 'text-red-200', close: 'text-red-400 hover:text-white' };
                case 'expiry-soon': return { container: 'bg-zinc-800 border-zinc-600 border-l-gray-500 text-white', icon: 'bg-gray-500/20 text-gray-400', textTitle: 'text-white', textBody: 'text-gray-400', close: 'text-gray-400 hover:text-white' };
                case 'low-stock': default: return { container: 'bg-yellow-900/80 border-yellow-700 border-l-yellow-500 text-white', icon: 'bg-yellow-500/20 text-yellow-500', textTitle: 'text-white', textBody: 'text-yellow-200', close: 'text-yellow-400 hover:text-white' };
            }
        }
        switch (type) {
            case 'expired': return { container: 'bg-gradient-to-r from-red-100 to-red-50 border border-red-300 border-l-red-600', icon: 'bg-white text-red-600', textTitle: 'text-red-900', textBody: 'text-red-800', close: 'text-red-700 hover:text-red-900' };
            case 'expiry-soon': return { container: 'bg-gradient-to-r from-gray-200 to-slate-100 border border-gray-300 border-l-gray-600', icon: 'bg-white text-gray-700', textTitle: 'text-gray-900', textBody: 'text-gray-700', close: 'text-gray-600 hover:text-gray-800' };
            case 'low-stock': default: return { container: 'bg-gradient-to-r from-yellow-100 to-yellow-50 border border-yellow-300 border-l-yellow-500', icon: 'bg-white text-yellow-600', textTitle: 'text-yellow-900', textBody: 'text-yellow-800', close: 'text-yellow-700 hover:text-yellow-900' };
        }
    };
    
    return (
        <ScreenWrapper darkMode={darkMode} highContrast={highContrast}>
            <Header onNavigate={onNavigate} onLogout={onLogout} onToggleSidebar={onToggleSidebar} darkMode={darkMode} highContrast={highContrast} />
            {currentToast && (() => {
                const styles = getToastStyles(currentToast.type);
                return (
                    <div key={currentToast.id} onClick={() => onNavigate('notifications')} className={`cursor-pointer absolute top-20 right-4 p-4 rounded-xl shadow-xl flex items-start gap-3 z-50 w-72 animate-slide-in-top transition-all border-l-4 ${styles.container}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${styles.icon}`}><span className="text-xl">{currentToast.type === 'low-stock' ? '📦' : (currentToast.type === 'expired' ? '☠️' : '⚠️')}</span></div>
                        <div className="flex-1"><p className={`font-bold text-sm ${styles.textTitle}`}>{currentToast.title}</p><p className={`text-xs mt-0.5 font-bold ${styles.textBody}`}>{currentToast.message}</p></div>
                        <button onClick={(e) => { e.stopPropagation(); setCurrentToast(null); }} className={`${styles.close} text-lg font-bold`}>&times;</button>
                    </div>
                );
            })()}
            <div className="flex-grow flex flex-col justify-center items-center text-center p-6">
                <h2 className={`text-2xl ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-gray-200' : 'text-gray-700')}`}>Bem-vindo ao seu gerenciador de despensa!</h2>
                <p className={`${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-500' : 'text-gray-500')} mt-2`}>Organize seus alimentos e evite desperdícios.</p>
            </div>
            <BottomNav activeScreen="dashboard" onNavigate={onNavigate} darkMode={darkMode} highContrast={highContrast} />
        </ScreenWrapper>
    );
};

const PageHeader: FC<{title: string, onBack: () => void, children?: React.ReactNode, darkMode?: boolean, highContrast?: boolean}> = ({title, onBack, children, darkMode, highContrast}) => (
    <header className={`p-4 flex justify-between items-center sticky top-0 z-10 ${highContrast ? 'bg-black border-b-2 border-yellow-400' : (darkMode ? 'bg-zinc-900 border-b border-zinc-800' : 'bg-yellow-300')}`}>
        <button onClick={onBack} className={`${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-700')}`}><ArrowLeftIcon className="w-6 h-6"/></button>
        <h1 className={`text-lg font-bold ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-red-500' : 'text-red-600')}`}>{title}</h1>
        <div>{children || <div className="w-6"/>}</div>
    </header>
);

const PantryScreen: FC<{products: Product[], onNavigate: (s: Screen) => void, onAddClick: () => void, onEditProduct: (product: Product) => void, onDeleteProduct: (id: number) => void, darkMode?: boolean, highContrast?: boolean}> = ({ products, onNavigate, onAddClick, onEditProduct, onDeleteProduct, darkMode, highContrast }) => (
    <ScreenWrapper darkMode={darkMode} highContrast={highContrast}>
        <PageHeader title="Meus Produtos" onBack={() => onNavigate('dashboard')} darkMode={darkMode} highContrast={highContrast}>
            <button onClick={onAddClick} className={`${highContrast ? 'bg-yellow-400 text-black hover:bg-yellow-500' : 'bg-red-500 text-white'} px-3 py-1 text-sm font-bold rounded-full flex items-center gap-1`}>+ Adicionar</button>
        </PageHeader>
        <div className="p-4"><input type="text" placeholder="🔍 Buscar itens..." className={`w-full p-3 rounded-full shadow-inner-sm outline-none ${highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400 placeholder-yellow-700' : (darkMode ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-white text-gray-800 border-gray-200')}`}/></div>
        <div className="flex-grow overflow-y-auto p-4 space-y-3">
            {products.length === 0 ? (
                <div className="mt-10 text-center text-gray-400"><span className="text-6xl opacity-50">📦</span><p className="mt-4">Sua despensa está vazia.</p><p>Adicione seu primeiro produto clicando em "+ Adicionar".</p></div>
            ) : products.map(p => (
                 <div key={p.id} className={`${highContrast ? 'bg-black border-2 border-yellow-400' : (darkMode ? 'bg-zinc-800' : 'bg-white')} p-3 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex items-center gap-4`}>
                    <div className="text-3xl flex items-center gap-2">
                        {p.image ? <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover" /> : <span>{CATEGORIES[p.category].icon}</span>}
                    </div>
                    <div className="flex-grow"><p className={`font-bold ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-800')}`}>{p.name}</p><p className={`text-xs ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>{new Date(p.expiryDate) < new Date() ? 'Vence hoje' : `Vence em ${Math.ceil((new Date(p.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24))} dias`} • {p.unit} un • {p.quantity}</p></div>
                    <div className="flex gap-2"><button onClick={() => onEditProduct(p)} className={`${highContrast ? 'text-yellow-400 hover:text-white' : 'text-gray-400 hover:text-blue-500'}`}><PencilIcon className="w-5 h-5"/></button><button onClick={() => onDeleteProduct(p.id)} className={`${highContrast ? 'text-yellow-400 hover:text-red-500' : 'text-gray-400 hover:text-red-500'}`}><TrashIcon className="w-5 h-5"/></button></div>
                </div>
            ))}
        </div>
        <BottomNav activeScreen="pantry" onNavigate={onNavigate} darkMode={darkMode} highContrast={highContrast} />
    </ScreenWrapper>
);

const NFCeImportModal: FC<{ products: NFCeProduct[], onClose: () => void, onConfirm: (selected: NFCeProduct[]) => void, darkMode?: boolean, highContrast?: boolean }> = ({ products, onClose, onConfirm, darkMode, highContrast }) => {
    const [selectedIndices, setSelectedIndices] = useState<number[]>(products.map((_, i) => i));
    
    const toggleSelection = (index: number) => {
        setSelectedIndices(prev => prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]);
    };

    const bgClass = highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-zinc-800 text-white' : 'bg-white text-gray-800');

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4 animate-fade-in-down">
            <div className={`w-full max-w-md rounded-2xl shadow-2xl p-6 flex flex-col max-h-[90vh] ${bgClass}`}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold">Importar da Nota</h2>
                    <button onClick={onClose} className="text-2xl">&times;</button>
                </div>
                
                <p className="text-sm mb-4 opacity-80">Selecione os produtos que deseja adicionar à sua despensa:</p>
                
                <div className="flex-grow overflow-y-auto space-y-2 pr-1 mb-6">
                    {products.map((p, i) => (
                        <div 
                            key={i} 
                            onClick={() => toggleSelection(i)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex justify-between items-center ${selectedIndices.includes(i) ? (highContrast ? 'bg-yellow-400 text-black border-white' : 'bg-red-50 border-red-500') : (highContrast ? 'border-yellow-900 opacity-60' : 'border-gray-100 opacity-60')}`}
                        >
                            <div className="flex-grow">
                                <p className="font-bold text-sm">{p.nome_padronizado}</p>
                                <p className="text-xs opacity-70">{p.quantidade} {p.unidade} • {p.categoria}</p>
                                <p className="text-[10px] italic opacity-50">{p.nome_original}</p>
                            </div>
                            {selectedIndices.includes(i) && <span className="text-red-500 font-bold">✓</span>}
                        </div>
                    ))}
                </div>

                <div className="flex gap-3">
                    <button onClick={onClose} className={`flex-1 py-3 font-bold rounded-xl border ${highContrast ? 'border-yellow-400' : 'border-gray-300'}`}>Cancelar</button>
                    <button 
                        onClick={() => onConfirm(products.filter((_, i) => selectedIndices.includes(i)))}
                        disabled={selectedIndices.length === 0}
                        className={`flex-1 py-3 font-bold rounded-xl disabled:opacity-50 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white'}`}
                    >
                        Importar ({selectedIndices.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

const ScannerLandingScreen: FC<{onNavigate: (s: Screen) => void, onOpenScanner: (mode: 'barcode' | 'qrcode' | 'nfce') => void, onPhotoScan: () => void, scannedHistory: ScannedItem[], onClearHistory: () => void, darkMode?: boolean, highContrast?: boolean}> = ({ onNavigate, onOpenScanner, onPhotoScan, scannedHistory, onClearHistory, darkMode, highContrast }) => (
    <ScreenWrapper darkMode={darkMode} highContrast={highContrast}>
        <PageHeader title="Leitor QR/Código" onBack={() => onNavigate('dashboard')} darkMode={darkMode} highContrast={highContrast} />
        <div className="p-4 space-y-4">
             <button onClick={() => onOpenScanner('barcode')} className={`w-full text-left p-4 ${highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700')} font-bold rounded-lg shadow-sm flex items-center gap-3`}><BarcodeIcon className="w-6 h-6"/> Ler Código de Barras</button>
             <button onClick={() => onOpenScanner('qrcode')} className={`w-full text-left p-4 ${highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700')} font-bold rounded-lg shadow-sm flex items-center gap-3`}><ScannerIcon className="w-6 h-6"/> Ler QR Code</button>
             <button onClick={() => onOpenScanner('nfce')} className={`w-full text-left p-4 ${highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700')} font-bold rounded-lg shadow-sm flex items-center gap-3`}><ReceiptIcon className="w-6 h-6"/> Escanear Nota Fiscal (NFC-e)</button>
             <button onClick={onPhotoScan} className={`w-full text-left p-4 ${highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : (darkMode ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-emerald-50 text-emerald-700 border border-emerald-200')} font-bold rounded-lg shadow-sm flex items-center gap-3`}>
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                     <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                     <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                 </svg>
                 Escanear Foto de Nota (IA)
             </button>
        </div>
        <div className="px-4 pt-2 flex justify-between items-center"><h2 className={`font-bold ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-gray-400' : 'text-gray-600')}`}>Últimos Escaneados</h2>{scannedHistory.length > 0 && <button onClick={onClearHistory} className={`text-xs font-bold ${highContrast ? 'text-yellow-400' : 'text-red-500'}`}>Limpar</button>}</div>
        <div className="flex-grow overflow-y-auto p-4 space-y-3">
            {scannedHistory.length === 0 ? (
                <div className={`mt-4 text-center ${highContrast ? 'text-yellow-700' : 'text-gray-400'}`}><p>Nenhum item escaneado recentemente.</p></div>
            ) : (
                scannedHistory.map((item, index) => (
                    <div key={`${item.code}-${index}`} className={`${highContrast ? 'bg-black border-2 border-yellow-400' : (darkMode ? 'bg-zinc-800' : 'bg-white')} p-3 rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] flex items-center gap-4`}>
                        <div className="w-12 h-12 flex-shrink-0">
                            {item.image ? (
                                <img src={item.image} alt={item.name} className={`w-full h-full rounded-lg object-cover ${highContrast ? 'border border-yellow-400' : 'border border-gray-100'}`} />
                            ) : (
                                <div className={`w-full h-full rounded-lg flex items-center justify-center text-2xl ${highContrast ? 'bg-yellow-900 text-yellow-400' : 'bg-gray-100'}`}>📦</div>
                            )}
                        </div>
                        <div className="flex-grow overflow-hidden"><p className={`font-bold truncate ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-800')}`}>{item.name}</p><p className={`text-xs mt-0.5 ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>{getExpiryStatus(item.expiryDate)} • {item.quantity || '1 un'}</p></div>
                    </div>
                ))
            )}
        </div>
        <BottomNav activeScreen="scanner" onNavigate={onNavigate} darkMode={darkMode} highContrast={highContrast} />
    </ScreenWrapper>
);

const BottomNav: FC<{ activeScreen: Screen, onNavigate: (s: Screen) => void, darkMode?: boolean, highContrast?: boolean }> = ({ activeScreen, onNavigate, darkMode, highContrast }) => {
    const navClass = highContrast ? 'bg-black border-t-2 border-yellow-400' : (darkMode ? 'bg-zinc-900 border-t border-zinc-800' : 'bg-gradient-to-r from-yellow-200 via-yellow-100 to-red-50 border-t-2 border-white/50');
    const itemClass = (isActive: boolean) => `flex flex-col items-center gap-1 p-2 flex-1 transition-all ${isActive ? (highContrast ? 'text-yellow-400 font-extrabold' : (darkMode ? 'text-red-400 font-extrabold' : 'text-gray-900 font-extrabold')) : (highContrast ? 'text-yellow-800 font-bold' : (darkMode ? 'text-gray-500 font-bold' : 'text-gray-900 font-bold'))}`;
    const iconClass = "w-6 h-6 stroke-2";
    return (
        <nav className={`flex justify-around items-center pb-safe ${navClass}`}>
            <button onClick={() => onNavigate('dashboard')} className={itemClass(activeScreen === 'dashboard')}><HomeIcon className={iconClass} /><span className="text-[10px] uppercase tracking-wide">Início</span></button>
            <button onClick={() => onNavigate('pantry')} className={itemClass(activeScreen === 'pantry')}><PantryIcon className={iconClass} /><span className="text-[10px] uppercase tracking-wide">Despensa</span></button>
            <button onClick={() => onNavigate('scanner')} className={`-mt-8 rounded-full p-4 shadow-lg border-4 ${highContrast ? 'bg-black border-yellow-400 text-yellow-400' : (darkMode ? 'bg-red-500 border-zinc-900 text-white' : 'bg-red-600 border-yellow-100 text-white')}`}><CameraIcon className="w-7 h-7 stroke-2" /></button>
            <button onClick={() => onNavigate('shoppingList')} className={itemClass(activeScreen === 'shoppingList')}><ShoppingListIcon className={iconClass} /><span className="text-[10px] uppercase tracking-wide">Lista</span></button>
            <button onClick={() => onNavigate('recipes')} className={itemClass(activeScreen === 'recipes')}><RecipeIcon className={iconClass} /><span className="text-[10px] uppercase tracking-wide">Receitas</span></button>
        </nav>
    );
};

const NotificationsScreen: FC<{notifications: Notification[], onMarkAllRead: () => void, onNavigate: (s: Screen) => void, darkMode?: boolean, highContrast?: boolean}> = ({ notifications, onMarkAllRead, onNavigate, darkMode, highContrast }) => {
    return (
        <ScreenWrapper darkMode={darkMode} highContrast={highContrast}>
            <PageHeader title="Notificações" onBack={() => onNavigate('dashboard')} darkMode={darkMode} highContrast={highContrast}>
                <button onClick={onMarkAllRead} className="text-xs font-bold underline">Ler tudo</button>
            </PageHeader>
            <div className="flex-grow overflow-y-auto p-4 space-y-3">
                {notifications.length === 0 ? <div className="mt-10 text-center opacity-60"><p>Nenhuma notificação no momento.</p></div> : notifications.map(n => <div key={n.id} className={`${highContrast ? 'bg-black border-2 border-yellow-400' : (darkMode ? 'bg-zinc-800' : 'bg-white')} p-4 rounded-xl shadow-sm flex gap-3 ${n.read ? 'opacity-60' : ''}`}><div className="text-2xl">{n.icon}</div><div><p className="font-bold">{n.title}</p><p className="text-sm opacity-80">{n.message}</p><p className="text-xs mt-1 opacity-50">{timeAgo(n.timestamp)}</p></div></div>)}
            </div>
            <BottomNav activeScreen="notifications" onNavigate={onNavigate} darkMode={darkMode} highContrast={highContrast} />
        </ScreenWrapper>
    );
};

const ShoppingListScreen: FC<{items: ShoppingItem[], onAddClick: () => void, onToggleItem: (id: number) => void, onDeleteItem: (id: number) => void, onEditItem: (item: ShoppingItem) => void, onClearPurchased: () => void, onAddFromPantry: () => void, onNavigate: (s: Screen) => void, darkMode?: boolean, highContrast?: boolean}> = ({ items, onAddClick, onToggleItem, onDeleteItem, onEditItem, onClearPurchased, onAddFromPantry, onNavigate, darkMode, highContrast }) => {
    const totalEstimated = useMemo(() => items.reduce((acc, item) => acc + parsePrice(item.estimatedPrice), 0), [items]);
    return (
        <ScreenWrapper darkMode={darkMode} highContrast={highContrast}>
            <PageHeader title="Lista de Compras" onBack={() => onNavigate('dashboard')} darkMode={darkMode} highContrast={highContrast}><button onClick={onClearPurchased} className="text-xs font-bold underline">Limpar comprados</button></PageHeader>
            <div className={`px-4 py-3 border-b ${highContrast ? 'bg-yellow-900 border-yellow-400' : (darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-yellow-50 border-yellow-100')} flex justify-between items-center`}><span className="font-bold text-sm uppercase opacity-80">Total Estimado</span><span className="font-bold text-lg">R$ {totalEstimated.toFixed(2).replace('.', ',')}</span></div>
            <div className="p-4 grid grid-cols-2 gap-3"><button onClick={onAddClick} className={`p-3 rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 ${highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white'}`}><PlusIcon className="w-4 h-4" /> Adicionar Item</button><button onClick={onAddFromPantry} className={`p-3 rounded-lg font-bold text-sm shadow-sm flex items-center justify-center gap-2 ${highContrast ? 'bg-black border-2 border-yellow-400 text-yellow-400' : 'bg-red-100 text-red-600'}`}><PantryIcon className="w-4 h-4" /> Da Despensa</button></div>
            <div className="flex-grow overflow-y-auto p-4 space-y-3">{items.length === 0 ? <div className="mt-10 text-center opacity-60"><p>Sua lista de compras está vazia.</p></div> : items.map(item => <div key={item.id} className={`p-3 rounded-xl shadow-sm flex items-center gap-3 transition-all ${item.checked ? 'opacity-50' : ''} ${highContrast ? 'bg-black border-2 border-yellow-400' : (darkMode ? 'bg-zinc-800' : 'bg-white')}`}><div onClick={() => onToggleItem(item.id)} className={`w-6 h-6 rounded border flex items-center justify-center cursor-pointer ${item.checked ? (highContrast ? 'bg-yellow-400 border-yellow-400' : 'bg-red-500 border-red-500 text-white') : 'border-gray-300'}`}>{item.checked && '✓'}</div><div className="flex-grow"><p className={`font-bold ${item.checked ? 'line-through opacity-70' : ''} ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-800')}`}>{item.name}</p><p className={`text-xs ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>{item.quantity}{item.estimatedPrice && ` • R$ ${item.estimatedPrice}`}</p></div><div className="flex gap-2"><button onClick={() => onEditItem(item)} className={`${highContrast ? 'text-yellow-400 hover:text-white' : 'text-gray-400 hover:text-blue-500'}`}><PencilIcon className="w-5 h-5"/></button><button onClick={() => onDeleteItem(item.id)} className={`${highContrast ? 'text-yellow-400 hover:text-red-500' : 'text-gray-400 hover:text-red-500'}`}><TrashIcon className="w-5 h-5"/></button></div></div>)}</div>
            <BottomNav activeScreen="shoppingList" onNavigate={onNavigate} darkMode={darkMode} highContrast={highContrast} />
        </ScreenWrapper>
    );
};

const RecipesScreen: FC<{recipes: Recipe[], pantryProducts: Product[], setRecipes: React.Dispatch<React.SetStateAction<Recipe[]>>, onNavigate: (s: Screen) => void, darkMode?: boolean, highContrast?: boolean}> = ({ recipes, pantryProducts, setRecipes, onNavigate, darkMode, highContrast }) => {
    const [filter, setFilter] = useState<'all' | 'quick' | 'healthy'>('all');
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    
    const filteredRecipes = filter === 'all' ? recipes : recipes.filter(r => r.category === filter);

    const handleGenerateRecipe = async () => {
        setIsGenerating(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const ingredientList = pantryProducts.map(p => p.name).join(', ');
            
            const prompt = `Act as a master chef. Create 3 creative recipes based PRIMARILY on these ingredients: ${ingredientList}.
            You can assume basic pantry staples (salt, oil, etc).
            Return a JSON array of 3 objects with this EXACT structure:
            {
                "title": "Recipe Name",
                "subtitle": "Short catchy description",
                "prepTime": "XX min",
                "difficulty": "Fácil" | "Médio" | "Difícil",
                "ingredients": ["ing1", "ing2", ...],
                "instructions": ["Step 1", "Step 2", ...],
                "category": "quick" | "healthy" | "all"
            }
            Do NOT include markdown formatting.`;

            const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config: { responseMimeType: "application/json" } });
            
            if (response.text) {
                const newRecipesRaw = JSON.parse(response.text);
                
                const newRecipes = await Promise.all(newRecipesRaw.map(async (r: any, index: number) => {
                    // Generate AI Image for the recipe
                    const imagePrompt = encodeURIComponent(`${r.title} food photography delicious high resolution`);
                    const imageUrl = `https://image.pollinations.ai/prompt/${imagePrompt}?width=800&height=600&nologo=true`;
                    
                    return {
                        id: Date.now() + index,
                        ...r,
                        image: imageUrl
                    };
                }));

                setRecipes(prev => [...newRecipes, ...prev]);
                alert("✨ 3 Novas receitas criadas pelo Chef IA!");
            }
        } catch (e) {
            console.error(e);
            alert("Erro ao gerar receitas. Tente novamente.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <ScreenWrapper darkMode={darkMode} highContrast={highContrast}>
            <PageHeader title="Receitas" onBack={() => onNavigate('dashboard')} darkMode={darkMode} highContrast={highContrast} />
            <div className="p-4 pb-2"><h2 className={`text-xl font-bold mb-2 ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-800')}`}>Descubra novos sabores</h2><p className={`text-sm ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>Receitas baseadas nos seus ingredientes.</p></div>
             <div className="px-4 pb-2">
                <button 
                    onClick={handleGenerateRecipe} 
                    disabled={isGenerating}
                    className={`w-full py-3 rounded-xl font-bold text-white shadow-lg flex items-center justify-center gap-2 transition-all ${isGenerating ? 'opacity-70 cursor-wait' : 'hover:scale-[1.02]'} ${highContrast ? 'bg-yellow-400 text-black border-2 border-white' : 'bg-gradient-to-r from-purple-500 to-indigo-600'}`}
                >
                    {isGenerating ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"/> : <span className="text-xl">✨</span>}
                    {isGenerating ? 'O Chef está pensando...' : 'Sugerir com meus Ingredientes'}
                </button>
            </div>
            <div className="flex gap-2 px-4 pb-4 overflow-x-auto scrollbar-hide"><button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${filter === 'all' ? (highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white') : (highContrast ? 'border border-yellow-400 text-yellow-400' : (darkMode ? 'bg-zinc-800 text-gray-300' : 'bg-gray-200 text-gray-600'))}`}>Todas</button><button onClick={() => setFilter('quick')} className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${filter === 'quick' ? (highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white') : (highContrast ? 'border border-yellow-400 text-yellow-400' : (darkMode ? 'bg-zinc-800 text-gray-300' : 'bg-gray-200 text-gray-600'))}`}>Rápidas</button><button onClick={() => setFilter('healthy')} className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${filter === 'healthy' ? (highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white') : (highContrast ? 'border border-yellow-400 text-yellow-400' : (darkMode ? 'bg-zinc-800 text-gray-300' : 'bg-gray-200 text-gray-600'))}`}>Saudáveis</button></div>
            <div className="flex-grow overflow-y-auto p-4 pt-0 space-y-4">
                {filteredRecipes.map(recipe => (
                    <div key={recipe.id} onClick={() => setSelectedRecipe(recipe)} className={`rounded-2xl overflow-hidden shadow-lg cursor-pointer transform transition hover:scale-[1.02] ${highContrast ? 'bg-black border-2 border-yellow-400' : (darkMode ? 'bg-zinc-800' : 'bg-white')}`}>
                        <div className="h-40 w-full relative">
                             <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4">
                                 <div><h3 className="text-white font-bold text-lg leading-tight">{recipe.title}</h3><p className="text-gray-300 text-xs">{recipe.subtitle}</p></div>
                             </div>
                             <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md px-2 py-1 rounded-lg text-xs font-bold text-white flex gap-2"><span>⏱ {recipe.prepTime}</span><span>🔥 {recipe.difficulty}</span></div>
                        </div>
                    </div>
                ))}
            </div>
            <BottomNav activeScreen="recipes" onNavigate={onNavigate} darkMode={darkMode} highContrast={highContrast} />
            {selectedRecipe && <RecipeModal recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} darkMode={darkMode} highContrast={highContrast} />}
        </ScreenWrapper>
    );
};

const SettingsScreen: FC<{settings: Settings, setSettings: React.Dispatch<React.SetStateAction<Settings>>, onNavigate: (s: Screen) => void, darkMode?: boolean, highContrast?: boolean}> = ({ settings, setSettings, onNavigate, darkMode, highContrast }) => {
    const updateSetting = (section: keyof Settings, key: string, value: any) => setSettings(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
    const Section: FC<{title: string, icon: string, children: React.ReactNode}> = ({title, icon, children}) => (
        <div className={`mb-6 rounded-2xl p-4 shadow-sm ${highContrast ? 'bg-black border-2 border-yellow-400' : (darkMode ? 'bg-zinc-800' : 'bg-gradient-to-r from-red-50 to-white border border-red-100')}`}>
            <h3 className={`font-bold text-lg mb-4 flex items-center gap-2 ${highContrast ? 'text-yellow-400' : 'text-red-500'}`}><span className="text-xl">{icon}</span> {title}</h3>
            <div className="space-y-4">{children}</div>
        </div>
    );
    const Toggle: FC<{label: string, desc: string, value: boolean, onChange: (v: boolean) => void}> = ({label, desc, value, onChange}) => (
        <div className="flex justify-between items-center py-2 border-b border-black/5 last:border-0">
            <div className="pr-4"><p className={`font-bold text-sm ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-800')}`}>{label}</p><p className={`text-xs ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>{desc}</p></div>
            <button onClick={() => onChange(!value)} className={`w-12 h-6 rounded-full transition-colors relative ${value ? (highContrast ? 'bg-yellow-400' : 'bg-red-500') : (highContrast ? 'bg-gray-700' : 'bg-gray-300')}`}><div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-all ${value ? 'left-7' : 'left-1'}`} /></button>
        </div>
    );
    return (
        <ScreenWrapper darkMode={darkMode} highContrast={highContrast}>
            <PageHeader title="Configurações" onBack={() => onNavigate('dashboard')} darkMode={darkMode} highContrast={highContrast}><button onClick={() => setSettings(DEFAULT_SETTINGS)} className={`px-3 py-1 rounded text-xs font-bold ${highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white'}`}>Resetar</button></PageHeader>
            <div className={`flex-grow overflow-y-auto p-4 ${highContrast ? 'bg-black' : (darkMode ? 'bg-zinc-900' : 'bg-white')}`}>
                <Section title="Aparência" icon="🎨">
                    <Toggle label="Modo Noturno" desc="Ativa tema escuro para reduzir cansaço visual" value={settings.appearance.darkMode} onChange={v => updateSetting('appearance', 'darkMode', v)} />
                    <div className="flex justify-between items-center py-2"><div className="pr-4"><p className={`font-bold text-sm ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-800')}`}>Tamanho da Fonte</p><p className={`text-xs ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>Ajusta o tamanho do texto na tela</p></div><select value={settings.appearance.fontSize} onChange={e => updateSetting('appearance', 'fontSize', e.target.value)} className={`p-1 rounded text-sm font-bold ${highContrast ? 'bg-black text-yellow-400 border border-yellow-400' : (darkMode ? 'bg-zinc-700 text-white' : 'bg-white text-gray-800 border border-gray-300')}`}><option>Normal</option><option>Grande</option><option>Extra Grande</option></select></div>
                </Section>
                <Section title="Notificações" icon="🔔">
                    <Toggle label="Alertas de Vencimento" desc="Notifica quando produtos estão próximos do vencimento" value={settings.notifications.expiryAlerts} onChange={v => updateSetting('notifications', 'expiryAlerts', v)} />
                    <Toggle label="Alertas de Estoque" desc="Notifica quando itens atingem 1 unidade ou menos" value={settings.notifications.stockAlerts} onChange={v => updateSetting('notifications', 'stockAlerts', v)} />
                    <div className="flex justify-between items-center py-2"><div className="pr-4"><p className={`font-bold text-sm ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-white' : 'text-gray-800')}`}>Dias de Antecedência</p><p className={`text-xs ${highContrast ? 'text-yellow-200' : (darkMode ? 'text-gray-400' : 'text-gray-500')}`}>Quantos dias antes do vencimento alertar</p></div><select value={settings.notifications.alertDays} onChange={e => updateSetting('notifications', 'alertDays', Number(e.target.value))} className={`p-1 rounded text-sm font-bold ${highContrast ? 'bg-black text-yellow-400 border border-yellow-400' : (darkMode ? 'bg-zinc-700 text-white' : 'bg-white text-gray-800 border border-gray-300')}`}><option value={3}>3 dias</option><option value={7}>7 dias</option><option value={15}>15 dias</option><option value={30}>30 dias</option></select></div>
                </Section>
                <Section title="Acessibilidade" icon="♿">
                    <Toggle label="Alto Contraste" desc="Aumenta o contraste para melhor visibilidade" value={settings.accessibility.highContrast} onChange={v => updateSetting('accessibility', 'highContrast', v)} />
                    <Toggle label="Animações Reduzidas" desc="Reduz animações para usuários sensíveis a movimento" value={settings.accessibility.reducedMotion} onChange={v => updateSetting('accessibility', 'reducedMotion', v)} />
                </Section>
            </div>
            <BottomNav activeScreen="settings" onNavigate={onNavigate} darkMode={darkMode} highContrast={highContrast} />
        </ScreenWrapper>
    );
};

const EditProfileScreen: FC<{user: User | null, onUpdateUser: (u: User) => void, onNavigate: (s: Screen) => void, darkMode?: boolean, highContrast?: boolean}> = ({ user, onUpdateUser, onNavigate, darkMode, highContrast }) => {
    const [name, setName] = useState(user?.name || '');
    const [email, setEmail] = useState(user?.email || '');
    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onUpdateUser({ name, email }); };
    const inputClass = `w-full p-3 rounded-lg outline-none ${highContrast ? 'bg-black text-yellow-400 border-2 border-yellow-400' : (darkMode ? 'bg-zinc-800 text-white' : 'bg-white text-gray-800 border border-gray-200')}`;
    return (
        <ScreenWrapper darkMode={darkMode} highContrast={highContrast}>
            <PageHeader title="Editar Perfil" onBack={() => onNavigate('dashboard')} darkMode={darkMode} highContrast={highContrast} />
            <div className="p-6">
                <div className="flex justify-center mb-8"><div className={`w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-md ${highContrast ? 'bg-yellow-400 text-black' : 'bg-red-100 text-red-500'}`}>👤</div></div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div><label className={`text-sm font-bold ml-1 ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-gray-300' : 'text-gray-600')}`}>Nome</label><input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} /></div>
                    <div><label className={`text-sm font-bold ml-1 ${highContrast ? 'text-yellow-400' : (darkMode ? 'text-gray-300' : 'text-gray-600')}`}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></div>
                    <button type="submit" className={`w-full py-3.5 mt-8 font-bold rounded-xl shadow-lg ${highContrast ? 'bg-yellow-400 text-black' : 'bg-red-500 text-white'}`}>Salvar Alterações</button>
                </form>
            </div>
        </ScreenWrapper>
    );
};

export default App;
