// ===== INTERNATIONALIZATION (i18n) SYSTEM =====
let translations = {};
let currentLang = 'fr';

// Detect user's preferred language
function detectLanguage() {
  // Try to get language from localStorage (user preference)
  const savedLang = localStorage.getItem('preferredLanguage');
  if (savedLang) {
    return savedLang;
  }

  // Try to detect from browser language
  const browserLang = navigator.language || navigator.userLanguage;
  const langCode = browserLang.split('-')[0]; // Get 'fr' from 'fr-FR'

  // Check if we support this language
  const supportedLanguages = ['fr', 'en', 'es', 'it', 'de', 'zh', 'ja', 'pt', 'ar', 'ru'];
  if (supportedLanguages.includes(langCode)) {
    return langCode;
  }

  // Default to English if language not supported
  return 'en';
}

// Load translations from JSON file
async function loadTranslations() {
  try {
    const response = await fetch('translations.json');
    translations = await response.json();
    console.log('Translations loaded successfully');
  } catch (error) {
    console.error('Error loading translations:', error);
  }
}

// Apply translations to the page
function applyTranslations(lang) {
  if (!translations[lang]) {
    console.error(`Language ${lang} not found in translations`);
    return;
  }

  currentLang = lang;

  // Update HTML lang attribute
  document.documentElement.lang = lang;

  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = getNestedTranslation(translations[lang], key);

    if (translation) {
      element.textContent = translation;
    }
  });

  // Update language selector
  const languageSelector = document.getElementById('language-selector');
  if (languageSelector) {
    languageSelector.value = lang;
  }

  // Save preference
  localStorage.setItem('preferredLanguage', lang);

  // Update page title and meta description
  updateMetadata(lang);
}

// Helper function to get nested translation (e.g., "nav.pricing")
function getNestedTranslation(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Update page metadata based on language
function updateMetadata(lang) {
  const titles = {
    fr: 'RealTranslate - Brisez les barrières linguistiques en temps réel',
    en: 'RealTranslate - Break language barriers in real-time',
    es: 'RealTranslate - Rompe las barreras lingüísticas en tiempo real',
    it: 'RealTranslate - Abbatti le barriere linguistiche in tempo reale',
    de: 'RealTranslate - Sprachbarrieren in Echtzeit überwinden',
    zh: 'RealTranslate - 实时打破语言障碍',
    ja: 'RealTranslate - リアルタイムで言語の壁を打ち破る',
    pt: 'RealTranslate - Quebre as barreiras linguísticas em tempo real',
    ar: 'RealTranslate - كسر الحواجز اللغوية في الوقت الفعلي',
    ru: 'RealTranslate - Преодолевайте языковые барьеры в реальном времени'
  };

  document.title = titles[lang] || titles.en;

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    const descriptions = {
      fr: 'Communiquez sans limites avec RealTranslate. Traduction instantanée et fluide pour vos conversations, messages et appels.',
      en: 'Communicate without limits with RealTranslate. Instant and smooth translation for your conversations, messages and calls.',
      es: 'Comunícate sin límites con RealTranslate. Traducción instantánea y fluida para tus conversaciones, mensajes y llamadas.',
      it: 'Comunica senza limiti con RealTranslate. Traduzione istantanea e fluida per le tue conversazioni, messaggi e chiamate.',
      de: 'Kommunizieren Sie grenzenlos mit RealTranslate. Sofortige und reibungslose Übersetzung für Ihre Gespräche, Nachrichten und Anrufe.',
      zh: '使用 RealTranslate 无限沟通。为您的对话、消息和通话提供即时流畅的翻译。',
      ja: 'RealTranslate で制限なくコミュニケーション。会話、メッセージ、通話のための即座でスムーズな翻訳。',
      pt: 'Comunique sem limites com RealTranslate. Tradução instantânea e fluida para suas conversas, mensagens e chamadas.',
      ar: 'تواصل بلا حدود مع RealTranslate. ترجمة فورية وسلسة لمحادثاتك ورسائلك ومكالماتك.',
      ru: 'Общайтесь без ограничений с RealTranslate. Мгновенный и плавный перевод для ваших разговоров, сообщений и звонков.'
    };
    metaDescription.content = descriptions[lang] || descriptions.en;
  }
}

// Initialize i18n system
async function initializeI18n() {
  await loadTranslations();
  const detectedLang = detectLanguage();
  applyTranslations(detectedLang);

  // Setup language selector event listener
  const languageSelector = document.getElementById('language-selector');
  if (languageSelector) {
    languageSelector.addEventListener('change', (e) => {
      applyTranslations(e.target.value);
    });
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeI18n);
} else {
  initializeI18n();
}

// ===== EXISTING FUNCTIONALITY =====

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// Navbar background on scroll
const navbar = document.querySelector('.navbar');
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;

  if (currentScroll > 50) {
    navbar.style.background = 'rgba(10, 10, 10, 0.95)';
    navbar.style.boxShadow = '0 2px 20px rgba(0, 0, 0, 0.3)';
  } else {
    navbar.style.background = 'rgba(10, 10, 10, 0.8)';
    navbar.style.boxShadow = 'none';
  }

  lastScroll = currentScroll;
});

// Intersection Observer for fade-in animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

// Observe sections for animation
document.querySelectorAll('.section').forEach((section) => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(30px)';
  section.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
  observer.observe(section);
});

// Observe cards for staggered animation
const cards = document.querySelectorAll('.feature-card, .persona-card');
cards.forEach((card, index) => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(30px)';
  card.style.transition = `opacity 0.6s ease-out ${index * 0.1}s, transform 0.6s ease-out ${index * 0.1}s`;
  observer.observe(card);
});

// Parallax effect removed - was causing clipping issues on scroll
// The hero section now stays fixed in its position

// Counter animation for stats
const animateCounter = (element, target, duration = 2000) => {
  const start = 0;
  const increment = target / (duration / 16); // 60fps
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      element.textContent = target;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
};

// Observe stats for counter animation
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.classList.contains('animated')) {
      entry.target.classList.add('animated');
      const target = parseInt(entry.target.getAttribute('data-target'));
      if (!isNaN(target)) {
        animateCounter(entry.target, target);
      }
    }
  });
}, { threshold: 0.5 });

// Mobile menu toggle (if needed)
const navLinks = document.querySelector('.nav-links');
const mobileMenuButton = document.querySelector('.mobile-menu-button');

if (mobileMenuButton) {
  mobileMenuButton.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
}

// Add hover effect to CTA buttons
const ctaButtons = document.querySelectorAll('.btn-primary, .btn-secondary');
ctaButtons.forEach(button => {
  button.addEventListener('mouseenter', (e) => {
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const ripple = document.createElement('span');
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    ripple.classList.add('ripple');
    button.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  });
});

// Add typing effect to hero title (fixed version)
const heroTitle = document.querySelector('.hero-title');
if (heroTitle) {
  const originalHTML = heroTitle.innerHTML;
  heroTitle.innerHTML = '';
  heroTitle.style.opacity = '1';

  let charIndex = 0;
  const typingSpeed = 30;

  const typeWriter = () => {
    if (charIndex <= originalHTML.length) {
      // Use substring to properly render HTML
      heroTitle.innerHTML = originalHTML.substring(0, charIndex);
      charIndex++;

      // Check if we're inside a tag to speed through it
      const currentChar = originalHTML.charAt(charIndex - 1);
      const nextChar = originalHTML.charAt(charIndex);

      if (currentChar === '<' || (heroTitle.innerHTML.lastIndexOf('<') > heroTitle.innerHTML.lastIndexOf('>'))) {
        // Inside a tag, continue immediately
        typeWriter();
      } else {
        setTimeout(typeWriter, typingSpeed);
      }
    }
  };

  // Start typing after a short delay
  setTimeout(typeWriter, 500);
}

// Log page view (for analytics, if needed)
console.log('RealTranslate Landing Page loaded successfully');

// Add Easter egg: Konami code
let konamiCode = [];
const konamiSequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

document.addEventListener('keydown', (e) => {
  konamiCode.push(e.key);
  konamiCode = konamiCode.slice(-10);

  if (konamiCode.join(',') === konamiSequence.join(',')) {
    document.body.style.animation = 'rainbow 2s linear infinite';
    setTimeout(() => {
      document.body.style.animation = '';
    }, 5000);
  }
});

// Add rainbow animation for Easter egg
const style = document.createElement('style');
style.textContent = `
  @keyframes rainbow {
    0% { filter: hue-rotate(0deg); }
    100% { filter: hue-rotate(360deg); }
  }

  .ripple {
    position: absolute;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.5);
    transform: scale(0);
    animation: ripple-effect 0.6s ease-out;
    pointer-events: none;
  }

  @keyframes ripple-effect {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);
