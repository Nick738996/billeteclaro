import {
  Home, Car, Utensils, HeartPulse, Repeat, ShoppingBag, TrendingUp, PiggyBank,
  Landmark, CreditCard, Gift, GraduationCap, HandCoins, ArrowLeftRight, ArrowDownToLine, CircleEllipsis,
  Dumbbell, Receipt, PawPrint, Plane, Shirt, Sparkles, Smartphone, Baby, Gamepad2, BookOpen, Wine,
  type LucideIcon,
} from 'lucide-react'
import type { Categoria } from './types'

// Ícono por categoría — usado en la placa de TransactionsList, la lista de
// BudgetManager, la leyenda de CategoriesCard y el onboarding paso 3.
// Centralizado acá para que las 4 pantallas muestren la misma categoría con
// el mismo ícono en vez de cada una inventar su propio mapeo.
export const CATEGORIA_ICON: Record<Categoria, LucideIcon> = {
  HOGAR: Home,
  TRANSPORTE: Car,
  SALIDAS: Utensils,
  SALUD: HeartPulse,
  SUSCRIPCIONES: Repeat,
  COMPRAS_ONLINE: ShoppingBag,
  INVERSION: TrendingUp,
  AHORROS: PiggyBank,
  PRESTAMO: Landmark,
  DEUDA: CreditCard,
  DONACIONES: Gift,
  EDUCACION: GraduationCap,
  REEMBOLSABLE: HandCoins,
  TRANSFERENCIA: ArrowLeftRight,
  INGRESO: ArrowDownToLine,
  OTRO: CircleEllipsis,
}

// Categorías personalizadas (el usuario les pone el nombre que quiera) no
// tienen forma de tener un ícono fijo — antes todas caían en el mismo
// círculo genérico sin importar el nombre. Esto adivina un ícono más
// preciso por palabra clave en la clave normalizada (ej. "DEPORTES",
// "RECIBOS") — mismo espíritu que guessCategoria() en commerceCategories.ts,
// pero para el NOMBRE de la categoría en vez del comercio de la transacción.
const CUSTOM_ICON_KEYWORDS: Array<{ pattern: RegExp; Icon: LucideIcon }> = [
  { pattern: /DEPORT|GIMNASIO|GYM/,           Icon: Dumbbell },
  { pattern: /RECIBO|FACTURA|SERVICIOS?_?PUB/, Icon: Receipt },
  { pattern: /RESTAURANT|COMIDA/,             Icon: Utensils },
  { pattern: /MASCOTA|PERRO|GATO/,            Icon: PawPrint },
  { pattern: /VIAJ|VUELO|HOTEL/,              Icon: Plane },
  { pattern: /ROPA|VESTIMENTA|CALZADO/,       Icon: Shirt },
  { pattern: /BELLEZA|SPA|CUIDADO_PERSONAL/,  Icon: Sparkles },
  { pattern: /TECNOLOG|CELULAR|TECH/,         Icon: Smartphone },
  { pattern: /DOMICILIO/,                     Icon: Smartphone },
  { pattern: /NIÑO|HIJO|BEBE/,                Icon: Baby },
  { pattern: /JUEGO|GAMING|VIDEOJUEGO/,       Icon: Gamepad2 },
  { pattern: /LIBRO|LECTURA/,                 Icon: BookOpen },
  { pattern: /^BAR$|LICOR|TRAGO/,             Icon: Wine },
]

export function getCategoryIcon(cat: string): LucideIcon {
  if (cat in CATEGORIA_ICON) return CATEGORIA_ICON[cat as Categoria]
  const match = CUSTOM_ICON_KEYWORDS.find(({ pattern }) => pattern.test(cat))
  return match ? match.Icon : CircleEllipsis
}
