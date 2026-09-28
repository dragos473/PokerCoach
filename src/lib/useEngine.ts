/** One engine worker client per component, terminated on unmount (it re-spawns lazily if reused). */
import { useEffect, useState } from 'react'
import { EngineClient } from '../engine/worker/client'

export function useEngine(): EngineClient {
  const [client] = useState(() => new EngineClient())
  useEffect(() => () => client.dispose(), [client])
  return client
}
