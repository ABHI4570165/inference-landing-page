import ThankYouPage from '../components/ThankYouPage'
import { OFFICIAL_FORM_PATH } from '../utils/routes'

// Official College Form thank-you page — official WhatsApp group
const OFFICIAL_WHATSAPP_LINK = 'https://chat.whatsapp.com/EHaZJcJ4NNu5XNHlukwitp?s=sh&p=a&mlu=1'

export default function ThankYou() {
  return <ThankYouPage whatsappLink={OFFICIAL_WHATSAPP_LINK} formPath={OFFICIAL_FORM_PATH} />
}
