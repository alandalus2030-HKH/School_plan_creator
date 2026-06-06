'use client'

import { Component, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  message:  string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center"
          dir="rtl">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">
            حدث خطأ غير متوقع
          </h2>
          <p className="text-slate-500 text-sm mb-6 max-w-md">
            تعذّر تحميل هذا القسم. يمكنك المحاولة مرة أخرى أو التواصل مع الدعم الفني.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: 'var(--gradient-button)' }}>
            إعادة المحاولة
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
