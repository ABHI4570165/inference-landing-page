import ThankYouPage from '../components/ThankYouPage'
import { INSTAGRAM_FORM_PATH } from '../utils/routes'

// Instagram Form thank-you page — Instagram campaign WhatsApp group
const INSTAGRAM_WHATSAPP_LINK = 'https://chat.whatsapp.com/C01ontsCAAeCGXMjHYktdK'

export default function InstagramThankYou() {
  return <ThankYouPage whatsappLink={INSTAGRAM_WHATSAPP_LINK} formPath={INSTAGRAM_FORM_PATH} />
}
