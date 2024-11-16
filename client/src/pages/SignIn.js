import React from 'react';
import { authentication } from 'linda-protocol';
import toast, { Toaster } from 'react-hot-toast';
import { Link, useNavigate } from 'react-router-dom';
import { gun, user } from 'linda-protocol';

export default function SignIn() {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isRedirecting, setIsRedirecting] = React.useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (isLoading || isRedirecting) return;
    if (!username.trim() || !password.trim()) {
      toast.error('Inserisci username e password');
      return;
    }

    setIsLoading(true);
    const toastId = toast.loading('Accesso in corso...');

    try {
      const result = await new Promise((resolve, reject) => {
        authentication.loginUser({ username, password }, (response) => {
          console.log('Login response:', response);
          if (response.success) resolve(response);
          else reject(new Error(response.errMessage));
        });
      });

      if (result.success) {
        // Attendi un momento per l'inizializzazione
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verifica se l'utente è stato autenticato correttamente
        if (user.is && user.is.pub === result.pub) {
          toast.success('Accesso effettuato', { id: toastId });
          
          // Salva le informazioni dell'utente
          localStorage.setItem('userPub', user.is.pub);
          localStorage.setItem('userAlias', user.is.alias || username);
          
          // Reindirizza alla homepage
          window.location.href = '/homepage';
        } else {
          // Attendi ancora un po' e riprova
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (user.is && user.is.pub === result.pub) {
            toast.success('Accesso effettuato', { id: toastId });
            localStorage.setItem('userPub', user.is.pub);
            localStorage.setItem('userAlias', user.is.alias || username);
            window.location.href = '/homepage';
          } else {
            throw new Error('Errore di autenticazione: utente non inizializzato');
          }
        }
      } else {
        throw new Error(result.errMessage || "Errore durante l'accesso");
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.message || "Errore durante l'accesso", { id: toastId });
      setIsLoading(false);
      setIsRedirecting(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !isLoading && !isRedirecting) {
      handleLogin();
    }
  };

  // Se stiamo già reindirizzando, mostra un loader
  if (isRedirecting) {
    return (
      <div className="w-screen h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <p className="mt-4 text-gray-600">Reindirizzamento in corso...</p>
      </div>
    );
  }

  return (
    <>
      <div className="w-screen h-screen flex flex-col justify-center items-center bg-gray-50">
        <div className="text-center -mt-24">
          <p className="text-4xl mb-8">Accedi</p>
          <div className="flex flex-col place-items-center mt-3">
            <input
              className="w-80 h-14 mt-3 rounded-full text-center"
              type="text"
              onChange={(e) => setUsername(e.target.value)}
              onKeyPress={handleKeyPress}
              value={username}
              placeholder="enter username"
              disabled={isLoading || isRedirecting}
            />
            <input
              className="w-80 h-14 mt-3 rounded-full text-center"
              type="password"
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              value={password}
              placeholder="enter password"
              disabled={isLoading || isRedirecting}
            />
            <div className="mt-4 space-y-4">
              <Link to="/landing">
                <button
                  disabled={isLoading || isRedirecting}
                  className={`w-80 h-14 bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-full ${
                    (isLoading || isRedirecting) ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Torna indietro
                </button>
              </Link>
              <button
                onClick={handleLogin}
                disabled={isLoading || isRedirecting}
                className={`w-80 h-14 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full focus:outline-none focus:shadow-outline ${
                  (isLoading || isRedirecting) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Accesso in corso...
                  </div>
                ) : (
                  'Login'
                )}
              </button>
              
              <button
                onClick={() => navigate('/register')}
                disabled={isLoading || isRedirecting}
                className="w-80 h-14 bg-white hover:bg-gray-100 text-blue-500 font-bold py-2 px-4 rounded-full border-2 border-blue-500 focus:outline-none focus:shadow-outline"
              >
                Crea account
              </button>
            </div>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            Non hai un account? Registrati ora!
          </div>
        </div>
      </div>
      <Toaster />
    </>
  );
}
