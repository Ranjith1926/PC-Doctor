import type { EngineApi } from '@shared/contracts'

declare global {
  interface Window {
    /** Exposed by the preload script. Undefined when the UI runs outside Electron. */
    pcDoctor?: EngineApi
  }
  interface BatteryManager extends EventTarget {
    level: number
    charging: boolean
    chargingTime: number
    dischargingTime: number
  }
  interface Navigator {
    getBattery?: () => Promise<BatteryManager>
  }
}

export {}
