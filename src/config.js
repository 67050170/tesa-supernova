export const CFG = {
    API_BASE: 'https://tesa-api.crma.dev/api',
    SOCKET_URL: 'https://tesa-api.crma.dev',
    MAPBOX_TOKEN: import.meta.env.VITE_MAPBOX_TOKEN,
    DEFENCE: {
      id: import.meta.env.VITE_DEFENCE_CAMERA_ID,
      token: import.meta.env.VITE_DEFENCE_CAMERA_TOKEN,
    },
    OFFENCE: {
      id: import.meta.env.VITE_OFFENCE_CAMERA_ID,
      token: import.meta.env.VITE_OFFENCE_CAMERA_TOKEN,
    },
  };
  