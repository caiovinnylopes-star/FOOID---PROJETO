
export type Screen = 
  | 'splash' 
  | 'welcome' 
  | 'login' 
  | 'register' 
  | 'dashboard' 
  | 'pantry' 
  | 'scanner' 
  | 'notifications' 
  | 'recipes' 
  | 'settings' 
  | 'shoppingList'
  | 'editProfile';

export interface User {
  name: string;
  email: string;
}

export type CategoryKey = 'dairy' | 'grains' | 'meats' | 'fruits' | 'vegetables' | 'beverages' | 'cleaning' | 'hygiene' | 'others';
export type StorageKey = 'fridge' | 'freezer' | 'fruit-bowl' | 'pantry';

export const CATEGORIES: Record<CategoryKey, { label: string; icon: string }> = {
  dairy: { label: 'Laticínios', icon: '🥛' },
  grains: { label: 'Grãos/Pães', icon: '🍞' },
  meats: { label: 'Carnes', icon: '🥩' },
  fruits: { label: 'Frutas', icon: '🍎' },
  vegetables: { label: 'Vegetais', icon: '🥦' },
  beverages: { label: 'Bebidas', icon: '🥤' },
  cleaning: { label: 'Limpeza', icon: '🧹' },
  hygiene: { label: 'Higiene', icon: '🧴' },
  others: { label: 'Outros', icon: '📦' },
};

export const STORAGE_TYPES: Record<StorageKey, { label: string; icon: string }> = {
  fridge: { label: 'Geladeira', icon: '❄️' },
  freezer: { label: 'Freezer', icon: '🧊' },
  'fruit-bowl': { label: 'Fruteira', icon: '🧺' },
  pantry: { label: 'Armário', icon: '🏠' },
};


export interface Product {
  id: string | number;
  name: string;
  category: CategoryKey;
  quantity: string; // Describes weight/volume (e.g. "500g", "1L")
  unit: number;     // Describes count (e.g. 1, 2, 3) - NEW FIELD
  expiryDate: string; // ISO string
  storage: StorageKey;
  notes?: string;
  image?: string; // URL of the product image
  barcode?: string; 
}

export interface ShoppingItem {
  id: string | number;
  name:string;
  category: CategoryKey;
  quantity: string;
  estimatedPrice?: string;
  notes?: string;
  checked: boolean;
}

export interface ScannedItem {
    id?: string | number;
    code: string;
    name: string;
    image?: string;
    timestamp: string;
    quantity?: string;   
    expiryDate?: string; 
}

export type NotificationType = 'expiry-soon' | 'expired' | 'low-stock' | 'added';
export type NotificationFilter = 'all' | 'expiry' | 'stock';

export interface Notification {
  id: string | number;
  type: NotificationType;
  icon: string;
  title: string;
  message: string;
  timestamp: string; // ISO string
  read: boolean;
}

export interface Recipe {
    id: string | number;
    title: string;
    subtitle: string;
    prepTime: string;
    difficulty: 'Fácil' | 'Médio' | 'Difícil';
    ingredients: string[];
    image: string;
    category: 'all' | 'quick' | 'healthy';
}

export interface NFCeProduct {
  nome_original: string;
  nome_padronizado: string;
  quantidade: number;
  unidade: string;
  categoria: string;
}

export interface Settings {
  appearance: {
    darkMode: boolean;
    fontSize: 'Normal' | 'Grande' | 'Extra Grande';
  };
  notifications: {
    expiryAlerts: boolean;
    stockAlerts: boolean; 
    alertDays: number;
  };
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
  };
}