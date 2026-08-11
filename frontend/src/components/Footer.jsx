import { PublicFooter } from './PublicShell'

// Fixed-position variant of the shared M H Foundation footer, used by the
// public pages whose layout pins it to the bottom of the viewport. The content
// itself lives in PublicShell so every public page shows the same footer.
export default function Footer() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <PublicFooter />
    </div>
  )
}
