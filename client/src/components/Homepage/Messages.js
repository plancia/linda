import React from 'react';
import Context from '../../contexts/context';
import { toast, Toaster } from 'react-hot-toast';
import { AiOutlineSend } from 'react-icons/ai';
import { messaging, blocking } from 'linda-protocol';
import { gun, user, notifications } from 'linda-protocol';

const { userBlocking } = blocking;

// Custom hook per l'intersection observer
const useIntersectionObserver = (callback, deps = []) => {
  const observer = React.useRef(null);

  React.useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            callback(entry.target.dataset.messageId);
          }
        });
      },
      { threshold: 0.5 }
    );

    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, deps);

  return observer.current;
};

// Custom hook for message receipts
const useMessageReceipts = (messageId, roomId) => {
  const [status, setStatus] = React.useState({ delivered: false, read: false });

  React.useEffect(() => {
    if (!messageId || !roomId) return;

    // const unsub = gun.get(`chats/${roomId}/receipts`)
    //   .get(messageId)
    //   .on((receipt) => {
    //     if (receipt) {
    //       setStatus({
    //         delivered: receipt.type === 'delivery' || receipt.type === 'read',
    //         read: receipt.type === 'read'
    //       });
    //     }
    //   });

    console.log(notifications.messageNotifications)

    const unsub = notifications.messageNotifications
      .observeReadReceipts(messageId, roomId)
      .subscribe((receipt) => {
        setStatus({
          delivered: receipt.type === 'delivery' || receipt.type === 'read',
          read: receipt.type === 'read',
        });
      });

    // Initial state check
    gun
      .get(`chats/${roomId}/receipts`)
      .get(messageId)
      .once((receipt) => {
        if (receipt) {
          setStatus({
            delivered: receipt.type === 'delivery' || receipt.type === 'read',
            read: receipt.type === 'read',
          });
        }
      });

    return () => {
      if (typeof unsub === 'function') {
        try {
          unsub();
        } catch (error) {
          console.warn('Error unsubscribing from receipts:', error);
        }
      }
    };
  }, [messageId, roomId]);

  return {
    status,
    setStatus,
    initMessageTracking: async () => {
      if (!user.is) return;
      await gun.get(`chats/${roomId}/receipts`).get(messageId).put({
        type: 'sent',
        timestamp: Date.now(),
        by: user.is.pub,
      });
    },
  };
};

// Custom hook for sending receipts
const useSendReceipt = () => {
  const sendReceipt = React.useCallback(async (messageId, roomId, type) => {
    if (!user.is || !messageId || !roomId) return;

    try {
      await gun.get(`chats/${roomId}/receipts`).get(messageId).put({
        type,
        timestamp: Date.now(),
        by: user.is.pub,
      });
    } catch (error) {
      console.warn(`Error sending ${type} receipt:`, error);
    }
  }, []);

  return {
    sendDeliveryReceipt: (messageId, roomId) =>
      sendReceipt(messageId, roomId, 'delivery'),
    sendReadReceipt: (messageId, roomId) =>
      sendReceipt(messageId, roomId, 'read'),
  };
};

// Single MessageStatus component combining both functionalities
const MessageStatus = ({ message }) => {
  const { selected } = React.useContext(Context);
  const { status } = useMessageReceipts(message.id, selected?.roomId);
  const { sendDeliveryReceipt, sendReadReceipt } = useSendReceipt();

  React.useEffect(() => {
    if (message && message.sender !== user.is.pub && !status.read) {
      sendDeliveryReceipt(message.id, selected?.roomId);
      sendReadReceipt(message.id, selected?.roomId);
    }
  }, [
    message,
    status.read,
    selected?.roomId,
    sendDeliveryReceipt,
    sendReadReceipt,
  ]);

  return (
    <span className="text-xs ml-1 flex">
      {!status.delivered && <span className="text-gray-400">✓</span>}
      {status.delivered && !status.read && (
        <span className="text-gray-400">✓✓</span>
      )}
      {status.read && <span className="text-blue-500">✓✓</span>}
    </span>
  );
};

// New hook to handle message visibility and receipts
const useMessageVisibility = (messages, setMessages, selected) => {
  const { sendDeliveryReceipt, sendReadReceipt } = useSendReceipt();

  const handleMessageVisible = React.useCallback(
    async (messageId) => {
      if (!selected?.pub || !selected?.roomId) return;

      // Trova il messaggio
      const message = messages.find((m) => m.id === messageId);

      // Invia notifica di lettura solo se il messaggio non è nostro e non è già stato segnato come letto
      if (message && message.sender !== user.is.pub && !message.read) {
        try {
          await sendDeliveryReceipt(messageId, selected.roomId);
          await sendReadReceipt(messageId, selected.roomId);

          // Aggiorna lo stato del messaggio localmente
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? { ...msg, delivered: true, read: true }
                : msg
            )
          );
        } catch (error) {
          console.warn('Error sending read receipt:', error);
        }
      }
    },
    [
      selected?.pub,
      selected?.roomId,
      messages,
      setMessages,
      sendDeliveryReceipt,
      sendReadReceipt,
    ]
  );

  return handleMessageVisible;
};

// Add this custom hook for message tracking
const useMessageTracking = () => {
  const initMessageTracking = React.useCallback(async (messageId, roomId) => {
    if (!user.is) return;

    await gun.get('chats').get(roomId).get('receipts').get(messageId).put({
      type: 'sent',
      timestamp: Date.now(),
      by: user.is.pub,
    });
  }, []);

  return { initMessageTracking };
};

export default function Messages({ chatData }) {
  const { selected, setCurrentChat, setSelected } = React.useContext(Context);
  const [messages, setMessages] = React.useState([]);
  const [newMessage, setNewMessage] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const messagesEndRef = React.useRef(null);
  const messageSubscriptionRef = React.useRef(null);
  const toastIdRef = React.useRef(null);
  const [isBlocked, setIsBlocked] = React.useState(false);
  const [canSendMessages, setCanSendMessages] = React.useState(true);
  const [showChatMenu, setShowChatMenu] = React.useState(false);
  const [blockStatus, setBlockStatus] = React.useState({
    blockedByMe: false,
    blockedByOther: false,
  });
  const blockCheckTimeoutRef = React.useRef(null);
  const lastBlockCheckRef = React.useRef(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [canPost, setCanPost] = React.useState(false);

  const { initMessageTracking } = useMessageTracking();

  // Use the new hook
  const handleMessageVisible = useMessageVisibility(
    messages,
    setMessages,
    selected
  );

  // Use the intersection observer with the handler from our hook
  const messageObserver = useIntersectionObserver(handleMessageVisible, [
    selected?.pub,
    chatData?.roomId,
  ]);

  // Reset quando cambia l'utente selezionato
  React.useEffect(() => {
    const cleanup = () => {
      if (messageSubscriptionRef.current) {
        try {
          if (typeof messageSubscriptionRef.current === 'function') {
            messageSubscriptionRef.current();
          } else if (messageSubscriptionRef.current.unsubscribe) {
            messageSubscriptionRef.current.unsubscribe();
          }
          messageSubscriptionRef.current = null;
        } catch (error) {
          console.warn('Error during messages cleanup:', error);
        }
      }
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
    };

    cleanup();
    setMessages([]);
    setCurrentChat(null);
    setError(null);
    setLoading(false);

    return cleanup;
  }, [selected?.pub, setCurrentChat]);

  // Funzione per pulire la chat
  const handleClearChat = async () => {
    if (!selected?.pub || !chatData?.roomId) return;

    if (
      window.confirm(
        'Sei sicuro di voler eliminare tutti i messaggi? Questa azione non può essere annullata.'
      )
    ) {
      try {
        // Rimuovi tutti i messaggi manualmente
        gun
          .get('chats')
          .get(chatData.roomId)
          .get('messages')
          .map()
          .once((msg, key) => {
            if (msg) {
              gun
                .get('chats')
                .get(chatData.roomId)
                .get('messages')
                .get(key)
                .put(null);
            }
          });

        setMessages([]);
        toast.success('Chat pulita con successo');
      } catch (error) {
        console.error('Error clearing chat:', error);
        toast.error('Errore durante la pulizia della chat');
      }
    }
  };

  // Funzione per verificare lo stato di blocco con throttling
  const checkBlockStatus = React.useCallback(async (userPub) => {
    // Evita controlli troppo frequenti (minimo 2 secondi tra un controllo e l'altro)
    const now = Date.now();
    if (lastBlockCheckRef.current && now - lastBlockCheckRef.current < 2000) {
      return;
    }

    lastBlockCheckRef.current = now;

    try {
      // Usa i metodi del servizio blocking
      const blockedByMe = await userBlocking.isBlocked(userPub);
      const blockedByOther = await userBlocking.isBlockedBy(userPub);

      console.log('Block status:', { blockedByMe, blockedByOther }); // Debug log

      // Aggiorna lo stato solo se è cambiato
      setBlockStatus((prev) => {
        if (
          prev.blockedByMe !== blockedByMe ||
          prev.blockedByOther !== blockedByOther
        ) {
          return { blockedByMe, blockedByOther };
        }
        return prev;
      });

      setIsBlocked(blockedByMe);
      setCanSendMessages(!blockedByMe && !blockedByOther);

      if (blockedByMe) {
        setError('blocked_by_me');
      } else if (blockedByOther) {
        setError('blocked_by_other');
      } else {
        setError(null);
      }
    } catch (error) {
      console.error('Error checking block status:', error);
    }
  }, []);

  // Funzione per sbloccare un utente
  const handleUnblock = async () => {
    if (!selected?.pub) return;

    try {
      await userBlocking.unblockUser(selected.pub);
      setIsBlocked(false);
      setCanSendMessages(true);
      setError(null);
      toast.success(`${selected.alias} è stato sbloccato`);
    } catch (error) {
      console.error('Error unblocking user:', error);
      toast.error("Errore durante lo sblocco dell'utente");
    }
  };

  // Aggiungi una funzione per bloccare l'utente
  const handleBlock = async () => {
    if (!selected?.pub) return;

    try {
      await userBlocking.blockUser(selected.pub);
      setIsBlocked(true);
      setCanSendMessages(false);
      toast.success(`${selected.alias} è stato bloccato`);
    } catch (error) {
      console.error('Error blocking user:', error);
      toast.error("Errore durante il blocco dell'utente");
    }
  };

  // Aggiungi questo effetto per verificare i permessi quando si seleziona un canale/gruppo
  React.useEffect(() => {
    if (!selected?.type || !selected?.roomId) return;

    const checkPermissions = async () => {
      if (selected.type === 'channel' || selected.type === 'group') {
        const isUserAdmin = await messaging.groups.isAdmin(
          selected.roomId,
          user.is.pub
        );
        setIsAdmin(isUserAdmin);
      }
    };

    checkPermissions();
  }, [selected?.type, selected?.roomId]);

  // Update the sendMessage function
  const sendMessage = async () => {
    if (!selected?.roomId || !newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage('');

    try {
      if (selected.type === 'channel' || selected.type === 'group') {
        if (selected.type === 'channel' && !isAdmin) {
          throw new Error('Solo gli admin possono pubblicare in questo canale');
        }

        await messaging.groups.sendGroupMessage(
          selected.roomId,
          messageContent
        );
      } else {
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Initialize message tracking
        await initMessageTracking(messageId, selected.roomId);

        await new Promise((resolve, reject) => {
          messaging.sendMessage(
            selected.roomId,
            selected.pub,
            messageContent,
            (response) => {
              if (response.success) resolve(response);
              else reject(new Error(response.errMessage));
            }
          );
        });
      }
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(error.message || "Errore nell'invio del messaggio");
      setNewMessage(messageContent);
    }
  };

  // Aggiungi anche un handler per l'invio con il tasto Enter
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      console.log('Enter key pressed, attempting to send message');
      sendMessage();
    }
  };

  // Modifica l'effetto che monitora lo stato di blocco
  React.useEffect(() => {
    if (!selected?.pub) return;

    let isSubscribed = true;

    // Verifica iniziale dello stato di blocco
    checkBlockStatus(selected.pub);

    // Monitora i cambiamenti dello stato di blocco per entrambi gli utenti
    const unsubMyBlocks = gun
      .user()
      .get('blocked_users')
      .map()
      .on(() => {
        if (!isSubscribed) return;

        // Usa il throttling per le verifiche di stato
        if (blockCheckTimeoutRef.current) {
          clearTimeout(blockCheckTimeoutRef.current);
        }

        blockCheckTimeoutRef.current = setTimeout(() => {
          checkBlockStatus(selected.pub);
        }, 1000);
      });

    const unsubOtherBlocks = gun
      .get(`~${selected.pub}`)
      .get('blocked_users')
      .map()
      .on(() => {
        if (!isSubscribed) return;

        // Usa il throttling per le verifiche di stato
        if (blockCheckTimeoutRef.current) {
          clearTimeout(blockCheckTimeoutRef.current);
        }

        blockCheckTimeoutRef.current = setTimeout(() => {
          checkBlockStatus(selected.pub);
        }, 1000);
      });

    return () => {
      isSubscribed = false;
      if (typeof unsubMyBlocks === 'function') unsubMyBlocks();
      if (typeof unsubOtherBlocks === 'function') unsubOtherBlocks();
      if (blockCheckTimeoutRef.current) {
        clearTimeout(blockCheckTimeoutRef.current);
      }
    };
  }, [selected?.pub, checkBlockStatus]);

  // Modifica l'effetto che gestisce i messaggi
  React.useEffect(() => {
    if (!selected?.roomId) return;

    let isSubscribed = true;
    setLoading(true);
    setError(null);
    setMessages([]); // Reset messages when changing chat

    const handleMessages = (data) => {
      if (!isSubscribed) return;

      if (data.initial) {
        const validMessages = (data.initial || []).filter(
          (msg) => msg && msg.content && msg.sender && msg.timestamp
        );
        setMessages(validMessages);
        setLoading(false);
      } else if (data.individual || data.message) {
        const messageData = data.individual || data.message;
        if (messageData && messageData.content) {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === messageData.id);
            if (!exists) {
              const newMessages = [...prev, messageData];
              return newMessages.sort((a, b) => a.timestamp - b.timestamp);
            }
            return prev;
          });
        }
      }
    };

    const handleError = (error) => {
      if (!isSubscribed) return;
      console.error('Error loading messages:', error);
      setError('Errore nel caricamento dei messaggi');
      setLoading(false);
    };

    const setupSubscription = async () => {
      try {
        if (messageSubscriptionRef.current) {
          if (typeof messageSubscriptionRef.current === 'function') {
            messageSubscriptionRef.current();
          } else if (messageSubscriptionRef.current.unsubscribe) {
            messageSubscriptionRef.current.unsubscribe();
          }
          messageSubscriptionRef.current = null;
        }

        let subscription;
        if (
          selected.isGroup ||
          selected.type === 'channel' ||
          selected.type === 'group'
        ) {
          subscription = messaging.groups
            .subscribeToGroupMessages(selected.roomId)
            .subscribe({
              next: handleMessages,
              error: handleError,
            });
        } else {
          console.log(
            'Setting up private chat subscription for roomId:',
            selected.roomId
          );
          subscription = messaging.messageList(selected.roomId).subscribe({
            next: handleMessages,
            error: handleError,
          });
        }

        messageSubscriptionRef.current = subscription;
      } catch (error) {
        console.error('Error setting up subscription:', error);
        handleError(error);
      }
    };

    setupSubscription();

    return () => {
      isSubscribed = false;
      if (messageSubscriptionRef.current) {
        try {
          if (typeof messageSubscriptionRef.current === 'function') {
            messageSubscriptionRef.current();
          } else if (messageSubscriptionRef.current.unsubscribe) {
            messageSubscriptionRef.current.unsubscribe();
          }
        } catch (error) {
          console.warn('Error during cleanup:', error);
        }
        messageSubscriptionRef.current = null;
      }
    };
  }, [selected?.roomId, selected?.type]);

  // Aggiungi un effetto separato per mantenere la chat corrente
  React.useEffect(() => {
    if (chatData) {
      console.log('Current chat updated:', chatData);
    }
  }, [chatData]);

  // Aggiungi un effetto per resettare la chat quando l'amico viene rimosso
  React.useEffect(() => {
    if (!selected?.pub) return;

    const unsubFriendRemoval = gun
      .get('friendships')
      .map()
      .on(() => {
        // Verifica se l'amicizia esiste ancora
        let friendshipExists = false;
        gun
          .get('friendships')
          .map()
          .once((data) => {
            if (
              data &&
              ((data.user1 === selected.pub && data.user2 === user.is.pub) ||
                (data.user2 === selected.pub && data.user1 === user.is.pub))
            ) {
              friendshipExists = true;
            }
          });

        // Se l'amicizia non esiste più, resetta la vista
        if (!friendshipExists) {
          setCurrentChat(null);
          setMessages([]);
          setError(null);
        }
      });

    return () => {
      if (typeof unsubFriendRemoval === 'function') unsubFriendRemoval();
    };
  }, [selected?.pub, setCurrentChat]);

  // Modifica l'effetto che monitora le ricevute
  React.useEffect(() => {
    if (!selected?.roomId) return;
    const subscriptions = new Map(); // Usa una Map per tenere traccia delle sottoscrizioni

    // Funzione per sottoscriversi a un singolo messaggio
    const subscribeToMessage = (message) => {
      if (message.sender !== user.is.pub || subscriptions.has(message.id))
        return;

      const unsubscribe = gun
        .get(`chats/${selected.roomId}/receipts`)
        .get(message.id)
        .on((receipt) => {
          if (!receipt) return;

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === receipt.messageId) {
                return {
                  ...msg,
                  delivered: receipt.type === 'delivery' || msg.delivered,
                  read: receipt.type === 'read' || msg.read,
                };
              }
              return msg;
            })
          );
        });

      if (typeof unsubscribe === 'function') {
        subscriptions.set(message.id, unsubscribe);
      }
    };

    // Sottoscrivi ai messaggi esistenti
    messages.forEach(subscribeToMessage);

    return () => {
      // Pulisci tutte le sottoscrizioni
      subscriptions.forEach((unsubscribe) => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      });
      subscriptions.clear();
    };
  }, [selected?.roomId]); // Rimuovi messages dalle dipendenze

  // Aggiungi un effetto separato per gestire i nuovi messaggi
  React.useEffect(() => {
    if (!selected?.roomId || !messages.length) return;

    // Trova l'ultimo messaggio
    const lastMessage = messages[messages.length - 1];

    // Se è un nostro messaggio, sottoscrivi alle sue ricevute
    if (lastMessage && lastMessage.sender === user.is.pub) {
      const unsubscribe = gun
        .get(`chats/${selected.roomId}/receipts`)
        .get(lastMessage.id)
        .on((receipt) => {
          if (!receipt) return;

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id === receipt.messageId) {
                return {
                  ...msg,
                  delivered: receipt.type === 'delivery' || msg.delivered,
                  read: receipt.type === 'read' || msg.read,
                };
              }
              return msg;
            })
          );
        });

      return () => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        }
      };
    }
  }, [selected?.roomId, messages.length]); // Usa messages.length invece di messages

  // Aggiungi questo effetto per verificare i permessi di pubblicazione
  React.useEffect(() => {
    const checkPostPermissions = async () => {
      if (!selected?.type || !selected?.roomId) return;

      if (selected.type === 'channel') {
        // Per i canali, solo gli admin possono postare
        const isUserAdmin = await messaging.groups.isAdmin(
          selected.roomId,
          user.is.pub
        );
        setCanPost(isUserAdmin);
      } else if (selected.type === 'group') {
        // Per i gruppi, tutti i membri possono postare
        const isMember = await messaging.groups.isMember(
          selected.roomId,
          user.is.pub
        );
        setCanPost(isMember);
      } else {
        // Per le chat private
        setCanPost(true);
      }
    };

    checkPostPermissions();
  }, [selected?.type, selected?.roomId]);

  if (!selected?.pub) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Seleziona un amico per chattare</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">Caricamento chat...</p>
      </div>
    );
  }

  if (blockStatus.blockedByMe) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center p-4 border-b bg-white">
          <img
            className="h-10 w-10 rounded-full mr-2"
            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selected.alias}&backgroundColor=b6e3f4`}
            alt=""
          />
          <span className="font-medium">{selected.alias}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500">Hai bloccato questo utente.</p>
            <button
              onClick={handleUnblock}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Sblocca
            </button>
          </div>
        </div>
      </div>
    );
  } else if (blockStatus.blockedByOther) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center p-4 border-b bg-white">
          <img
            className="h-10 w-10 rounded-full mr-2"
            src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selected.alias}&backgroundColor=b6e3f4`}
            alt=""
          />
          <span className="font-medium">{selected.alias}</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500">Sei stato bloccato da questo utente.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && error !== 'Sei stato bloccato') {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (error === 'Amicizia terminata') {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-gray-500 mb-2">Amicizia terminata</p>
          <p className="text-sm text-gray-400">
            Seleziona un altro amico per chattare
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b bg-white">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
            {selected.type === 'channel' ? (
              '📢'
            ) : selected.type === 'group' ? (
              '👥'
            ) : (
              <img
                className="h-10 w-10 rounded-full"
                src={`https://api.dicebear.com/7.x/bottts/svg?seed=${selected.alias || selected.name}&backgroundColor=b6e3f4`}
                alt=""
              />
            )}
          </div>
          <div>
            <span className="font-medium">
              {selected.name || selected.alias}
            </span>
            {(selected.type === 'channel' || selected.type === 'group') && (
              <span className="text-xs text-gray-500 block">
                {selected.members?.length || 0} membri •
                {isAdmin ? ' Admin' : ' Membro'}
              </span>
            )}
          </div>
        </div>

        {/* Menu azioni chat */}
        <div className="relative">
          <button
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            onClick={() => setShowChatMenu(!showChatMenu)}
            title="Opzioni chat"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>

          {showChatMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg z-50">
              <div className="py-1">
                {/* Opzioni per chat private */}
                {!selected.type && (
                  <>
                    <button
                      onClick={() => {
                        setShowChatMenu(false);
                        handleClearChat();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Pulisci chat
                    </button>
                    <button
                      onClick={() => {
                        setShowChatMenu(false);
                        isBlocked ? handleUnblock() : handleBlock();
                      }}
                      className={`block w-full text-left px-4 py-2 text-sm ${
                        isBlocked
                          ? 'text-blue-600 hover:bg-blue-50'
                          : 'text-red-600 hover:bg-red-50'
                      }`}
                    >
                      {isBlocked ? 'Sblocca utente' : 'Blocca utente'}
                    </button>
                  </>
                )}

                {/* Opzioni per gruppi/canali */}
                {(selected.type === 'channel' || selected.type === 'group') && (
                  <>
                    {isAdmin && (
                      <button
                        onClick={async () => {
                          setShowChatMenu(false);
                          if (
                            window.confirm(
                              `Sei sicuro di voler eliminare questo ${selected.type === 'channel' ? 'canale' : 'gruppo'}?`
                            )
                          ) {
                            try {
                              await messaging.groups.deleteGroup(
                                selected.roomId
                              );
                              toast.success(
                                `${selected.type === 'channel' ? 'Canale' : 'Gruppo'} eliminato con successo`
                              );
                              setSelected(null);
                            } catch (error) {
                              console.error('Error deleting group:', error);
                              toast.error(error.message);
                            }
                          }
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        Elimina{' '}
                        {selected.type === 'channel' ? 'canale' : 'gruppo'}
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        setShowChatMenu(false);
                        if (
                          window.confirm(
                            `Sei sicuro di voler uscire da questo ${selected.type === 'channel' ? 'canale' : 'gruppo'}?`
                          )
                        ) {
                          try {
                            await messaging.groups.leaveGroup(selected.roomId);
                            toast.success(
                              `Hai lasciato il ${selected.type === 'channel' ? 'canale' : 'gruppo'}`
                            );
                            setSelected(null);
                          } catch (error) {
                            console.error('Error leaving group:', error);
                            toast.error(error.message);
                          }
                        }
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Esci dal{' '}
                      {selected.type === 'channel' ? 'canale' : 'gruppo'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        style={{
          maxHeight: 'calc(100vh - 180px)', // Altezza massima considerando header e input
          scrollBehavior: 'smooth',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-red-500">{error}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Nessun messaggio</p>
          </div>
        ) : (
          messages
            .filter((message) => message && message.content)
            .map((message) => (
              <div
                key={message.id}
                ref={(el) => {
                  if (el && messageObserver) {
                    el.dataset.messageId = message.id;
                    messageObserver.observe(el);
                  }
                }}
                className={`flex flex-col ${
                  message.sender === user.is.pub ? 'items-end' : 'items-start'
                }`}
              >
                <div className="flex items-end">
                  <div
                    className={`rounded-lg px-4 py-2 max-w-[70%] ${
                      message.sender === user.is.pub
                        ? 'bg-blue-500 text-white rounded-br-none'
                        : 'bg-gray-200 rounded-bl-none'
                    }`}
                  >
                    {typeof message.content === 'string'
                      ? message.content
                      : '[Messaggio non valido]'}
                  </div>
                  {message.sender === user.is.pub && (
                    <MessageStatus message={message} />
                  )}
                </div>
                <span className="text-xs text-gray-500 mt-1">
                  {new Date(message.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area - mostra solo se l'utente può postare */}
      {canPost ? (
        <div className="border-t p-4 bg-white">
          <div className="flex items-center">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                selected.type === 'channel'
                  ? 'Pubblica un post nel canale...'
                  : selected.type === 'group'
                    ? 'Scrivi un messaggio nel gruppo...'
                    : 'Scrivi un messaggio...'
              }
              className="flex-1 rounded-full px-4 py-2 bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className={`ml-2 p-2 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors ${
                !newMessage.trim() ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <AiOutlineSend size={20} />
            </button>
          </div>
        </div>
      ) : selected.type === 'channel' ? (
        <div className="border-t p-4 bg-white text-center text-gray-500">
          Solo gli admin possono pubblicare in questo canale
        </div>
      ) : (
        <div className="border-t p-4 bg-white text-center text-gray-500">
          Non hai i permessi per scrivere in questo{' '}
          {selected.type === 'group' ? 'gruppo' : 'canale'}
        </div>
      )}
      <Toaster />
    </div>
  );
}
