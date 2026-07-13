import ThankYouPage from '../components/ThankYouPage'
import { MISSED_TEST_FORM_PATH } from '../utils/routes'

// Missed Test Form thank-you page — WhatsApp group for missed-test applicants.
// TODO: replace with a dedicated Missed Test WhatsApp group link if one exists;
// currently reuses the official group link.
const MISSED_TEST_WHATSAPP_LINK = 'https://chat.whatsapp.com/EHaZJcJ4NNu5XNHlukwitp?s=sh&p=a&mlu=1'

export default function MissedTestThankYou() {
  return <ThankYouPage whatsappLink={MISSED_TEST_WHATSAPP_LINK} formPath={MISSED_TEST_FORM_PATH} />
}
