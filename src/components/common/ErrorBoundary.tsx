import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 렌더/계산 중 예외가 발생해도 흰 화면 대신 복구 안내를 보여준다 (F5).
 *
 * 손상된 저장 데이터(localStorage)가 원인일 수 있으므로, 저장 데이터를 비우고
 * 새로 시작할 수 있는 버튼을 제공한다.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('앱 렌더링 중 오류가 발생했습니다.', error, info)
  }

  private handleReset = (): void => {
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('wc2026-')) localStorage.removeItem(key)
      }
    } catch {
      /* localStorage 접근 불가 환경은 무시 */
    }
    location.reload()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <div className="text-4xl">⚠️</div>
          <h1 className="text-lg font-semibold text-white">문제가 발생했습니다</h1>
          <p className="text-sm text-gray-400">
            화면을 그리는 중 오류가 발생했습니다. 저장된 데이터가 손상되었을 수 있습니다.
            아래 버튼으로 저장 데이터를 지우고 처음부터 다시 시작할 수 있습니다.
          </p>
          <pre className="max-w-full overflow-x-auto rounded-lg bg-black/30 p-3 text-left text-[11px] text-red-300">
            {this.state.error.message}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={() => location.reload()}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
            >
              새로고침
            </button>
            <button
              onClick={this.handleReset}
              className="rounded-xl bg-red-500/20 px-4 py-2 text-sm text-red-200 hover:bg-red-500/30"
            >
              저장 데이터 지우고 다시 시작
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
