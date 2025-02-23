import CryptoJS from 'crypto-js';

const encryptionKey = process.env.INTEGRATION_ENCRYPTION_KEY!;

export const encrypt = (data: string): string => {
  return CryptoJS.AES.encrypt(data, encryptionKey).toString();
};

export const decrypt = (data: string): string => {
  return CryptoJS.AES.decrypt(data, encryptionKey).toString(CryptoJS.enc.Utf8);
};