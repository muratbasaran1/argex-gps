import { useEffect, useState } from 'react';
import { View, Text, Button, ScrollView } from 'react-native';

async function fetchSettings() {
  const apiBase = process.env.API_BASE_URL || 'http://localhost:4000';
  const res = await fetch(`${apiBase}/api/settings`);
  const data = await res.json();
  return data.settings || [];
}

export default function App() {
  const [settings, setSettings] = useState([]);
  const [status, setStatus] = useState('');

  const load = async () => {
    try {
      setStatus('Ayarlar güncelleniyor...');
      const items = await fetchSettings();
      setSettings(items);
      setStatus('Ayarlar yenilendi.');
    } catch (err) {
      setStatus(`Hata: ${err.message}`);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView style={{ padding: 24 }}>
      <Text style={{ fontSize: 18, marginBottom: 12 }}>Sunucu Ayarları</Text>
      <Text style={{ marginBottom: 12 }}>{status}</Text>
      <Button title="Yeniden Yükle" onPress={load} />
      {settings.map((item) => (
        <View key={item.id} style={{ paddingVertical: 8 }}>
          <Text>Key: {item.key}</Text>
          <Text>Value: {item.value}</Text>
          <Text>Açıklama: {item.description}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
