import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="glass-card p-10 text-center max-w-md w-full">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-[var(--warning)]" />
            </div>
            <h2 className="text-xl font-bold mb-2">Нещо се обърка</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              Възникна неочаквана грешка. Моля, опитай да презаредиш страницата.
            </p>
            <button
              onClick={this.handleReset}
              className="btn-outline inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Опитай отново
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
