import { useEffect, useState } from 'react';
import { View, Text, Button, ScrollView, TextInput } from 'react-native';
import { API_BASE_URL } from '@env';

async function fetchSettings() {
  const apiBase = API_BASE_URL || 'http://localhost:4000';
  const res = await fetch(`${apiBase}/api/settings/public`);
  const data = await res.json();
  return data.settings || [];
}

export default function App() {
  const [settings, setSettings] = useState([]);
  const [status, setStatus] = useState('');
  const [manifest, setManifest] = useState([]);
  const [bearerToken, setBearerToken] = useState('');
  const [teamId, setTeamId] = useState('');

  const apiBase = API_BASE_URL || 'http://localhost:4000';

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

  const fetchManifest = async () => {
    try {
      setStatus('Manifest çekiliyor...');
      const res = await fetch(`${apiBase}/api/maps/public/tiles/manifest`);
      const data = await res.json();
      setManifest(data.packages || []);
      setStatus('Manifest indirildi.');
    } catch (err) {
      setStatus(`Manifest hatası: ${err.message}`);
    }
  };

  const sendTelemetryPing = async () => {
    if (!teamId) {
      setStatus('Önce takım ID girin');
      return;
    }
    if (!bearerToken) {
      setStatus('Bearer token girin (protected uçlar için)');
      return;
    }
    try {
      setStatus('Telemetri gönderiliyor...');
      const res = await fetch(`${apiBase}/api/teams/${teamId}/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({ note: 'Mobil ping', recordedAt: new Date().toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Telemetri hatası');
      setStatus('Telemetri kaydedildi');
    } catch (err) {
      setStatus(`Telemetri hatası: ${err.message}`);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView style={{ padding: 24 }}>
      <Text style={{ fontSize: 18, marginBottom: 12 }}>Sunucu Ayarları</Text>
      <Text style={{ marginBottom: 8 }}>Aktif API tabanı: {apiBase}</Text>
      <Text style={{ marginBottom: 12 }}>{status}</Text>
      <Button title="Yeniden Yükle" onPress={load} />
      {settings.map((item) => (
        <View key={item.key} style={{ paddingVertical: 8 }}>
          <Text>{item.key}</Text>
          <Text selectable>{item.value}</Text>
        </View>
      ))}
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Offline Manifest</Text>
        <Button title="Manifesti Getir" onPress={fetchManifest} />
        {manifest.map((pkg) => (
          <View key={pkg.id} style={{ paddingVertical: 6 }}>
            <Text>{pkg.region} / v{pkg.version}</Text>
            <Text selectable>{pkg.manifestUrl}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 16 }}>
        <Text style={{ fontWeight: 'bold' }}>Takım Telemetrisi (protected)</Text>
        <TextInput
          placeholder="Bearer token"
          value={bearerToken}
          onChangeText={setBearerToken}
          style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, marginVertical: 4 }}
        />
        <TextInput
          placeholder="Takım ID"
          value={teamId}
          onChangeText={setTeamId}
          style={{ borderWidth: 1, borderColor: '#ccc', padding: 8, marginVertical: 4 }}
        />
        <Button title="Ping gönder" onPress={sendTelemetryPing} />
      </View>
    </ScrollView>
  );
}
