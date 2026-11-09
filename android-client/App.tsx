import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Picker } from '@react-native-picker/picker';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:8000';

type Mode = 'text-to-video' | 'image-to-video' | 'audio-to-video' | 'reference-video';

export default function App() {
  const [mode, setMode] = useState<Mode>('text-to-video');
  const [prompt, setPrompt] = useState('A slow cinematic tracking shot through a rain-soaked neon market');
  const [duration, setDuration] = useState('5');
  const [status, setStatus] = useState('Ready');
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  async function chooseFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!result.canceled) setFile(result.assets[0]);
  }

  async function generate() {
    try {
      setOutput(null); setStatus('Uploading…');
      let uploaded: any = null;
      if (file) {
        const body = new FormData();
        body.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
        const uploadResponse = await fetch(`${API}/api/upload`, { method: 'POST', body });
        uploaded = await uploadResponse.json();
      }
      const payload: any = { prompt, mode, duration: Number(duration), aspect_ratio: '16:9', resolution: '720p', audio: true };
      if (uploaded) payload[mode === 'image-to-video' ? 'image_path' : mode === 'audio-to-video' ? 'audio_path' : 'reference_video_path'] = uploaded.filename;
      setStatus('Queued…');
      const response = await fetch(`${API}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const job = await response.json();
      poll(job.id);
    } catch (error: any) { setStatus('Error'); Alert.alert('Generation failed', error.message); }
  }

  async function poll(id: string) {
    const response = await fetch(`${API}/api/jobs/${id}`); const job = await response.json();
    setStatus(`${job.status} · ${job.progress}%`);
    if (job.status === 'completed') setOutput(`${API}${job.output_url}`);
    else if (job.status !== 'failed') setTimeout(() => poll(id), 1000);
  }

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>LOCAL VIDEO LAB</Text><Text style={styles.title}>Seedance{ '\n' }Studio</Text>
    <Text style={styles.subtitle}>A mobile control surface for multimodal video creation.</Text>
    <View style={styles.card}>
      <Text style={styles.label}>WORKFLOW</Text>
      <View style={styles.picker}><Picker selectedValue={mode} onValueChange={setMode}><Picker.Item label="Text to video" value="text-to-video"/><Picker.Item label="Image to video" value="image-to-video"/><Picker.Item label="Audio to video" value="audio-to-video"/><Picker.Item label="Reference video" value="reference-video"/></Picker></View>
      <Text style={styles.label}>PROMPT</Text><TextInput multiline value={prompt} onChangeText={setPrompt} style={styles.input} placeholderTextColor="#74777c" />
      <Text style={styles.label}>DURATION · 1–30 SEC</Text><TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={styles.input} />
      <Pressable style={styles.secondary} onPress={chooseFile}><Text style={styles.secondaryText}>{file ? `Attached: ${file.name}` : 'Attach image, audio, or reference video'}</Text></Pressable>
      <Pressable style={styles.primary} onPress={generate}><Text style={styles.primaryText}>Generate preview  ↗</Text></Pressable>
      <Text style={styles.status}>{status}</Text>
      {output && <Pressable onPress={() => Linking.openURL(output)}><Text style={styles.link}>Open generated video</Text></Pressable>}
    </View>
    <Text style={styles.note}>Set EXPO_PUBLIC_API_URL to the computer’s LAN address when testing on a physical Android device.</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#101214' }, content: { padding: 24, paddingTop: 54 }, kicker: { color: '#9b9a99', letterSpacing: 2, fontSize: 11 }, title: { color: '#f4f0e8', fontSize: 52, lineHeight: 48, fontFamily: 'serif', marginTop: 12 }, subtitle: { color: '#9b9a99', fontSize: 16, marginTop: 18, marginBottom: 24 }, card: { backgroundColor: '#171a1e', borderColor: '#34383d', borderWidth: 1, borderRadius: 18, padding: 18 }, label: { color: '#9b9a99', fontSize: 10, letterSpacing: 2, marginTop: 14, marginBottom: 7 }, picker: { backgroundColor: '#0f1113', borderRadius: 9, overflow: 'hidden' }, input: { color: '#f4f0e8', backgroundColor: '#0f1113', borderColor: '#34383d', borderWidth: 1, borderRadius: 9, padding: 12, minHeight: 48 }, secondary: { borderColor: '#34383d', borderWidth: 1, borderRadius: 999, padding: 14, marginTop: 18 }, secondaryText: { color: '#c3c2be', textAlign: 'center' }, primary: { backgroundColor: '#d9ff62', borderRadius: 999, padding: 15, marginTop: 12 }, primaryText: { color: '#101214', textAlign: 'center', fontWeight: '700' }, status: { color: '#9b9a99', textAlign: 'center', marginTop: 14 }, link: { color: '#d9ff62', textAlign: 'center', marginTop: 10 }, note: { color: '#74777c', fontSize: 12, marginTop: 18, lineHeight: 18 }
});
