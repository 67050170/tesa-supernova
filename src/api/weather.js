export async function getWeather(lat, lng) {
    // ใช้ Open-Meteo (ไม่ต้องใช้ API key)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&wind_speed_unit=ms&timezone=Asia%2FBangkok`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      const c = json.current_weather;
      return {
        temp: c?.temperature ?? null,
        wind: c?.windspeed ?? null,
        windDir: c?.winddirection ?? null,
        condition: '—',
        humidity: null, // endpoint ฟรีไม่คืน humidity ปัจจุบัน
      };
    } catch {
      return { temp: null, wind: null, windDir: null, condition: '—', humidity: null };
    }
  }
  