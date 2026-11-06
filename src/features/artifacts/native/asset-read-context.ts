import { createContext, useContext } from 'react'
import type { AssetRead } from './asset-reads'

// Standalone previews and export callers keep their existing authorized reader.
const standalone: AssetRead = async (asset, artifactId, signal) => {
  const { fetchArtifactAsset } = await import('./assets')
  return fetchArtifactAsset(asset, artifactId, signal)
}
export const ArtifactAssetReadContext = createContext<AssetRead>(standalone)
export const useArtifactAssetRead = () => useContext(ArtifactAssetReadContext)
