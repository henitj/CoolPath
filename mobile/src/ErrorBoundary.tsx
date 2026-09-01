/**
 * ErrorBoundary — the last line of defence. Any render crash shows a calm
 * recovery screen (with the logo) instead of a red error box.
 */
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import CoolPathLogo from './components/CoolPathLogo'
import { C, R, TYPO } from './theme'

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) }
  }

  componentDidCatch(err: unknown) {
    console.warn('CoolPath caught:', err)
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.wrap}>
          <CoolPathLogo size={72} mood="error" />
          <Text style={styles.title}>Something hiccuped</Text>
          <Text style={styles.body}>
            Nothing was lost. Tap below and CoolPath will start fresh.
          </Text>
          <Pressable style={styles.btn} onPress={() => this.setState({ hasError: false, message: '' })}>
            <Text style={styles.btnText}>Start again</Text>
          </Pressable>
        </View>
      )
    }
    return this.props.children
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  title: { ...TYPO.h1 },
  body: { ...TYPO.body, textAlign: 'center' },
  btn: { backgroundColor: C.mintDeep, borderRadius: R.pill, paddingHorizontal: 28, paddingVertical: 13, marginTop: 8 },
  btnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
})
