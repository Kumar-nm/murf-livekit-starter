export type Language = 'en' | 'hi' | 'kn' | 'ta' | 'te';

export interface LanguageOption {
  code: Language;
  label: string;
  nativeLabel: string;
}

export const LANGUAGES: LanguageOption[] = [
  {
    code: 'en',
    label: 'English',
    nativeLabel: 'English',
  },
  {
    code: 'hi',
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
  },
  {
    code: 'kn',
    label: 'Kannada',
    nativeLabel: 'ಕನ್ನಡ',
  },
  {
    code: 'ta',
    label: 'Tamil',
    nativeLabel: 'தமிழ்',
  },
  {
    code: 'te',
    label: 'Telugu',
    nativeLabel: 'తెలుగు',
  },
];

export const translations = {
  en: {
    brand: 'Arogya Health Access',
    healthcareVoiceAssistant:
      'Your healthcare voice assistant',
    welcome: 'Welcome to',
    description:
      'Get accessible healthcare guidance through a simple voice conversation. Speak naturally and let your assistant help you.',
    startTalking: 'Start Talking',
    privateConversation:
      'Tap to start a private voice conversation',
    voiceFirst: 'Voice First',
    healthGuidance: 'Health Guidance',
    accessible: 'Accessible',
    poweredBy: '• Built with Murf falcon & LiveKit',

    connecting: 'Connecting...',
    connectingDescription:
      'Please wait while we connect you to your health assistant.',

    callEnded: 'Call ended',
    conversationEnded:
      'Your conversation has ended.',
    startAgain: 'Start Again',
    backToHome: 'Back to Home',

    microphoneAccess:
      'Microphone access is needed',
    microphoneDescription:
      'Your browser blocked microphone access. Allow microphone access in your browser settings and try again.',
    tryAgain: 'Try Again',

    listening: 'Listening to you',
    speaking: 'Agent is speaking',
    thinking: 'Thinking...',
    connected: 'Connected',
    conversation: 'Conversation',
  },

  hi: {
    brand: 'आरोग्य हेल्थ एक्सेस',
    healthcareVoiceAssistant:
      'आपका स्वास्थ्य वॉइस असिस्टेंट',
    welcome: 'स्वागत है',
    description:
      'सरल वॉइस बातचीत के माध्यम से स्वास्थ्य संबंधी मार्गदर्शन प्राप्त करें। स्वाभाविक रूप से बोलें और अपना असिस्टेंट आपको सहायता करने दें।',
    startTalking: 'बात करना शुरू करें',
    privateConversation:
      'निजी वॉइस बातचीत शुरू करने के लिए टैप करें',
    voiceFirst: 'वॉइस फर्स्ट',
    healthGuidance: 'स्वास्थ्य मार्गदर्शन',
    accessible: 'सुलभ',
    poweredBy: '• Murf Falcon और LiveKit के साथ निर्मित',

    connecting: 'कनेक्ट हो रहा है...',
    connectingDescription:
      'कृपया प्रतीक्षा करें, हम आपको आपके स्वास्थ्य असिस्टेंट से जोड़ रहे हैं।',

    callEnded: 'कॉल समाप्त',
    conversationEnded:
      'आपकी बातचीत समाप्त हो गई है।',
    startAgain: 'फिर से शुरू करें',
    backToHome: 'होम पर वापस जाएँ',

    microphoneAccess:
      'माइक्रोफ़ोन की अनुमति आवश्यक है',
    microphoneDescription:
      'आपके ब्राउज़र ने माइक्रोफ़ोन की अनुमति रोक दी है। ब्राउज़र सेटिंग्स में माइक्रोफ़ोन की अनुमति दें और फिर प्रयास करें।',
    tryAgain: 'फिर प्रयास करें',

    listening: 'आपकी बात सुनी जा रही है',
    speaking: 'असिस्टेंट बोल रहा है',
    thinking: 'सोच रहा है...',
    connected: 'कनेक्टेड',
    conversation: 'बातचीत',
  },

  kn: {
    brand: 'ಆರೋಗ್ಯ ಹೆಲ್ತ್ ಆಕ್ಸೆಸ್',
    healthcareVoiceAssistant:
      'ನಿಮ್ಮ ಆರೋಗ್ಯ ಧ್ವನಿ ಸಹಾಯಕ',
    welcome: 'ಸ್ವಾಗತ',
    description:
      'ಸರಳ ಧ್ವನಿ ಸಂಭಾಷಣೆಯ ಮೂಲಕ ಆರೋಗ್ಯ ಮಾರ್ಗದರ್ಶನ ಪಡೆಯಿರಿ. ಸಹಜವಾಗಿ ಮಾತನಾಡಿ ಮತ್ತು ನಿಮ್ಮ ಸಹಾಯಕ ನಿಮಗೆ ನೆರವಾಗಲು ಬಿಡಿ.',
    startTalking: 'ಮಾತನಾಡಲು ಪ್ರಾರಂಭಿಸಿ',
    privateConversation:
      'ಖಾಸಗಿ ಧ್ವನಿ ಸಂಭಾಷಣೆ ಪ್ರಾರಂಭಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ',
    voiceFirst: 'ಧ್ವನಿ ಮೊದಲಿಗೆ',
    healthGuidance: 'ಆರೋಗ್ಯ ಮಾರ್ಗದರ್ಶನ',
    accessible: 'ಸುಲಭವಾಗಿ ಲಭ್ಯ',
    poweredBy: '• Murf Falcon ಮತ್ತು LiveKit ಬಳಸಿ ನಿರ್ಮಿಸಲಾಗಿದೆ',

    connecting: 'ಸಂಪರ್ಕಿಸಲಾಗುತ್ತಿದೆ...',
    connectingDescription:
      'ದಯವಿಟ್ಟು ನಿರೀಕ್ಷಿಸಿ, ನಿಮ್ಮ ಆರೋಗ್ಯ ಸಹಾಯಕರೊಂದಿಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇವೆ.',

    callEnded: 'ಕರೆ ಮುಗಿದಿದೆ',
    conversationEnded:
      'ನಿಮ್ಮ ಸಂಭಾಷಣೆ ಮುಗಿದಿದೆ.',
    startAgain: 'ಮತ್ತೆ ಪ್ರಾರಂಭಿಸಿ',
    backToHome: 'ಮುಖಪುಟಕ್ಕೆ ಹಿಂತಿರುಗಿ',

    microphoneAccess:
      'ಮೈಕ್ರೋಫೋನ್ ಅನುಮತಿ ಅಗತ್ಯವಿದೆ',
    microphoneDescription:
      'ನಿಮ್ಮ ಬ್ರೌಸರ್ ಮೈಕ್ರೋಫೋನ್ ಅನುಮತಿಯನ್ನು ನಿರ್ಬಂಧಿಸಿದೆ. ಬ್ರೌಸರ್ ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಮೈಕ್ರೋಫೋನ್ ಅನುಮತಿಸಿ ಮತ್ತು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    tryAgain: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',

    listening: 'ನಿಮ್ಮ ಮಾತನ್ನು ಕೇಳಲಾಗುತ್ತಿದೆ',
    speaking: 'ಸಹಾಯಕ ಮಾತನಾಡುತ್ತಿದ್ದಾರೆ',
    thinking: 'ಆಲೋಚಿಸಲಾಗುತ್ತಿದೆ...',
    connected: 'ಸಂಪರ್ಕಗೊಂಡಿದೆ',
    conversation: 'ಸಂಭಾಷಣೆ',
  },

  ta: {
    brand: 'ஆரோக்கியா ஹெல்த் ஆக்சஸ்',
    healthcareVoiceAssistant:
      'உங்கள் சுகாதார குரல் உதவியாளர்',
    welcome: 'வரவேற்கிறோம்',
    description:
      'எளிய குரல் உரையாடல் மூலம் சுகாதார வழிகாட்டுதலைப் பெறுங்கள். இயல்பாகப் பேசுங்கள், உங்கள் உதவியாளர் உங்களுக்கு உதவட்டும்.',
    startTalking: 'பேசத் தொடங்குங்கள்',
    privateConversation:
      'தனிப்பட்ட குரல் உரையாடலைத் தொடங்க தட்டவும்',
    voiceFirst: 'குரல் முதலில்',
    healthGuidance: 'சுகாதார வழிகாட்டுதல்',
    accessible: 'அணுகக்கூடியது',
    poweredBy: '• Murf Falcon மற்றும் LiveKit மூலம் உருவாக்கப்பட்டது',

    connecting: 'இணைக்கப்படுகிறது...',
    connectingDescription:
      'தயவுசெய்து காத்திருக்கவும், உங்கள் சுகாதார உதவியாளருடன் இணைக்கிறோம்.',

    callEnded: 'அழைப்பு முடிந்தது',
    conversationEnded:
      'உங்கள் உரையாடல் முடிந்துவிட்டது.',
    startAgain: 'மீண்டும் தொடங்குங்கள்',
    backToHome: 'முகப்புக்குத் திரும்புங்கள்',

    microphoneAccess:
      'மைக்ரோஃபோன் அனுமதி தேவை',
    microphoneDescription:
      'உங்கள் உலாவி மைக்ரோஃபோன் அனுமதியைத் தடுத்துள்ளது. உலாவி அமைப்புகளில் மைக்ரோஃபோன் அனுமதியை வழங்கி மீண்டும் முயற்சிக்கவும்.',
    tryAgain: 'மீண்டும் முயற்சிக்கவும்',

    listening: 'உங்கள் பேச்சைக் கேட்கிறது',
    speaking: 'உதவியாளர் பேசுகிறார்',
    thinking: 'சிந்திக்கிறது...',
    connected: 'இணைக்கப்பட்டுள்ளது',
    conversation: 'உரையாடல்',
  },

  te: {
    brand: 'ఆరోగ్య హెల్త్ యాక్సెస్',
    healthcareVoiceAssistant:
      'మీ ఆరోగ్య వాయిస్ అసిస్టెంట్',
    welcome: 'స్వాగతం',
    description:
      'సులభమైన వాయిస్ సంభాషణ ద్వారా ఆరోగ్య మార్గదర్శకత్వాన్ని పొందండి. సహజంగా మాట్లాడండి మరియు మీ అసిస్టెంట్ మీకు సహాయం చేయనివ్వండి.',
    startTalking: 'మాట్లాడటం ప్రారంభించండి',
    privateConversation:
      'ప్రైవేట్ వాయిస్ సంభాషణ ప్రారంభించడానికి ట్యాప్ చేయండి',
    voiceFirst: 'వాయిస్ ఫస్ట్',
    healthGuidance: 'ఆరోగ్య మార్గదర్శకత్వం',
    accessible: 'అందుబాటులో ఉంటుంది',
    poweredBy: '• Murf Falcon మరియు LiveKit తో నిర్మించబడింది',

    connecting: 'కనెక్ట్ అవుతోంది...',
    connectingDescription:
      'దయచేసి వేచి ఉండండి, మీ ఆరోగ్య సహాయకుడితో మిమ్మల్ని కనెక్ట్ చేస్తున్నాము.',

    callEnded: 'కాల్ ముగిసింది',
    conversationEnded:
      'మీ సంభాషణ ముగిసింది.',
    startAgain: 'మళ్లీ ప్రారంభించండి',
    backToHome: 'హోమ్‌కు తిరిగి వెళ్లండి',

    microphoneAccess:
      'మైక్రోఫోన్ అనుమతి అవసరం',
    microphoneDescription:
      'మీ బ్రౌజర్ మైక్రోఫోన్ అనుమతిని నిరోధించింది. బ్రౌజర్ సెట్టింగ్‌లలో మైక్రోఫోన్‌కు అనుమతి ఇచ్చి మళ్లీ ప్రయత్నించండి.',
    tryAgain: 'మళ్లీ ప్రయత్నించండి',

    listening: 'మీ మాట వింటోంది',
    speaking: 'అసిస్టెంట్ మాట్లాడుతోంది',
    thinking: 'ఆలోచిస్తోంది...',
    connected: 'కనెక్ట్ అయింది',
    conversation: 'సంభాషణ',
  },
} as const;

export type Translation = (typeof translations)[Language];