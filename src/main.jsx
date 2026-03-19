import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
} from 'react-router-dom';
import { MotionProvider } from '@/lib/motion';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { cleanupLegacyPwaState } from './utils/legacyPwaCleanup';
import App from './App';
import './index.css';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route
      path="*"
      element={(
        <AuthProvider>
          <App />
        </AuthProvider>
      )}
    />
  )
);

cleanupLegacyPwaState();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <MotionProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </MotionProvider>
    </ThemeProvider>
  </StrictMode>
);
