/**
 * @module sendMessage
 * @description Module for sending encrypted messages between users
 */

import { gun, user, DAPP_NAME } from '../useGun.js';
import { messageNotifications } from '../notifications/index.js';
import messageList from './messageList.js';
import { blocking } from '../index.js';
import { updateGlobalMetrics } from '../system/systemService.js';

const { userBlocking } = blocking;

/**
 * Sends an encrypted message to a recipient in a chat
 * @async
 * @param {string} chatId - The ID of the chat where the message will be sent
 * @param {string} recipientPub - The public key of the message recipient
 * @param {string} content - The message content to be encrypted and sent
 * @param {Function} [callback] - Optional callback function to handle the result
 * @returns {Promise<Object>} Object containing success status and message details
 * @throws {Error} If user is not authenticated or encryption fails
 */
const sendMessage = async (
  chatId,
  recipientPub,
  content,
  callback = () => {}
) => {
  console.log('Sending message:', { chatId, recipientPub, content });

  if (!user.is) {
    console.error('User not authenticated');
    return callback({
      success: false,
      errMessage: 'User not authenticated',
    });
  }

  try {
    // Verifica lo stato di blocco
    const blockStatus = await userBlocking.getBlockStatus(recipientPub);
    if (blockStatus.blocked) {
      throw new Error('Non puoi inviare messaggi a un utente che hai bloccato');
    }
    if (blockStatus.blockedBy) {
      throw new Error('Non puoi inviare messaggi a un utente che ti ha bloccato');
    }

    // Verifica se la chat esiste
    const chat = await new Promise((resolve) => {
      gun
        .get(DAPP_NAME)
        .get('chats')
        .get(chatId)
        .once((chat) => resolve(chat));
    });

    if (!chat) {
      console.error('Chat not found');
      return callback({
        success: false,
        errMessage: 'Chat non trovata',
      });
    }

    // Crea un ID univoco per il messaggio
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log('Generated message ID:', messageId);

    // Usa la funzione di crittografia da messageList
    const encryptedContent = await messageList.encryptMessage(content, recipientPub);
    console.log('Message encrypted successfully');

    // Cripta l'anteprima
    const previewContent = content.substring(0, 50) + (content.length > 50 ? '...' : '');
    const encryptedPreview = await messageList.encryptMessage(previewContent, recipientPub);

    // Prepara i dati del messaggio
    const messageData = {
      sender: user.is.pub,
      recipient: recipientPub,
      timestamp: Date.now(),
      senderAlias: user.is.alias || 'Unknown',
      id: messageId,
      status: 'pending',
      content: encryptedContent,
      preview: encryptedPreview,
      version: '2.0',
    };

    // Inizializza il tracciamento del messaggio
    await messageNotifications.initMessageTracking(messageId, chatId);

    // Salva il messaggio
    await new Promise((resolve, reject) => {
      gun
        .get(DAPP_NAME)
        .get('chats')
        .get(chatId)
        .get('messages')
        .get(messageId)
        .put(messageData, (ack) => {
          if (ack.err) {
            console.error('Error saving message:', ack.err);
            reject(new Error(ack.err));
          } else {
            console.log('Message saved successfully');
            resolve();
          }
        });
    });

    // Aggiorna lastMessage usando l'anteprima criptata
    gun.get(DAPP_NAME).get('chats').get(chatId).get('lastMessage').put({
      content: encryptedPreview,
      sender: user.is.pub,
      timestamp: Date.now(),
      version: '2.0',
    });

    console.log('Message sent successfully:', messageId);

    // Incrementa il contatore dei messaggi inviati
    updateGlobalMetrics('totalMessagesSent', 1);

    return callback({
      success: true,
      messageId,
      message: 'Message sent successfully',
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return callback({
      success: false,
      errMessage: error.message || 'Error sending message',
    });
  }
};

export default sendMessage;
