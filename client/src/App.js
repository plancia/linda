import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { user } from './useGun';
import Context from './contexts/context';
import { AuthProvider } from './components/AuthProvider';
import RequireAuth from './components/RequireAuth';

// Importa le pagine
import LandingPage from './pages/LandingPage';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Homepage from './pages/Homepage';

// Componente per proteggere le rotte
const ProtectedRoute = ({ children }) => {
  if (!user.is) {
    return <Navigate to="/landing" replace />;
  }
  return children;
};

// Componente per reindirizzare gli utenti autenticati
const PublicRoute = ({ children }) => {
  if (user.is) {
    return <Navigate to="/homepage" replace />;
  }
  return children;
};

function App() {
  const [pub, setPub] = React.useState(null);
  const [alias, setAlias] = React.useState(null);
  const [friends, setFriends] = React.useState([]);
  const [selected, setSelected] = React.useState(null);
  const [currentChat, setCurrentChat] = React.useState(null);
  const [connectionState, setConnectionState] = React.useState('disconnected');

  return (
    <Context.Provider
      value={{
        pub,
        setPub,
        alias,
        setAlias,
        friends,
        setFriends,
        selected,
        setSelected,
        currentChat,
        setCurrentChat,
        connectionState,
        setConnectionState,
      }}
    >
      <Router>
        <AuthProvider>
          <Routes>
            <Route 
              path="/landing" 
              element={
                <PublicRoute>
                  <LandingPage />
                </PublicRoute>
              } 
            />
            <Route 
              path="/login" 
              element={
                <PublicRoute>
                  <SignIn />
                </PublicRoute>
              } 
            />
            <Route 
              path="/register" 
              element={
                <PublicRoute>
                  <SignUp />
                </PublicRoute>
              } 
            />
            <Route 
              path="/homepage" 
              element={
                <ProtectedRoute>
                  <Homepage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/" 
              element={
                <RequireAuth>
                  <Homepage />
                </RequireAuth>
              } 
            />
            <Route 
              path="*" 
              element={<Navigate to="/landing" replace />} 
            />
          </Routes>
        </AuthProvider>
      </Router>
    </Context.Provider>
  );
}

export default App;
