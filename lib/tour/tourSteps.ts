import { FEATURE_AI_ADVISOR } from '@/lib/features'

export type TourStep = {
  id: string
  targetTestId: string
  titulo: string
  descripcion: string
  posicion: 'top' | 'bottom' | 'left' | 'right'
}

// El paso "advisor" solo se incluye si el panel realmente se renderiza (ver
// FEATURE_AI_ADVISOR en DashboardClient.tsx) — si no, TourTooltip no
// encuentra el target y el tour completo desaparece a mitad de camino.
const ALL_STEPS: Array<TourStep & { requiresFeature?: boolean }> = [
  {
    id: 'progress',
    targetTestId: 'dashboard-month-progress',
    titulo: 'Tu resumen del mes',
    descripcion: 'Acá ves cuánto llevas gastado vs tus ingresos totales, el dinero disponible, y los días que quedan. Todo en tiempo real.',
    posicion: 'bottom',
  },
  {
    id: 'budget',
    targetTestId: 'tour-budget',
    titulo: 'Tu presupuesto',
    descripcion: 'Configura cuánto quieres gastar en cada categoría. Las barras te muestran si vas bien o si ya te pasaste.',
    posicion: 'top',
  },
  {
    id: 'advisor',
    targetTestId: 'tour-advisor',
    titulo: 'Tu asesor financiero',
    descripcion: 'Una IA que analiza tus gastos y te da consejos personalizados. Toca "Hablar con mi asesor" para hacerle preguntas.',
    posicion: 'top',
    requiresFeature: true,
  },
  {
    id: 'transactions',
    targetTestId: 'tour-transactions',
    titulo: 'Tus transacciones',
    descripcion: 'Todas tus compras y pagos detectados automáticamente desde tu correo. Busca, filtra por categoría o agrega una manualmente.',
    posicion: 'top',
  },
]

export const TOUR_STEPS: TourStep[] = ALL_STEPS.filter(s => !s.requiresFeature || FEATURE_AI_ADVISOR)
