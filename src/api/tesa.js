import axios from 'axios';
import { CFG } from '../config';

export async function getCameraInfo(cameraId, token) {
  const res = await axios.get(`${CFG.API_BASE}/object-detection/info/${cameraId}`, {
    headers: { 'x-camera-token': token },
  });
  return res.data.data;
}

export async function getHistory(cameraId, token) {
  const res = await axios.get(`${CFG.API_BASE}/object-detection/${cameraId}`, {
    headers: { 'x-camera-token': token },
  });
  return res.data.data;
}
