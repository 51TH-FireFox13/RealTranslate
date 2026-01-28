// Billing toggle functionality
const billingToggle = document.getElementById('billing-toggle');
const monthlyPrices = document.querySelectorAll('.monthly-price');
const yearlyPrices = document.querySelectorAll('.yearly-price');

if (billingToggle) {
  billingToggle.addEventListener('change', function() {
    if (this.checked) {
      // Show yearly prices
      monthlyPrices.forEach(price => price.style.display = 'none');
      yearlyPrices.forEach(price => price.style.display = 'inline');
    } else {
      // Show monthly prices
      monthlyPrices.forEach(price => price.style.display = 'inline');
      yearlyPrices.forEach(price => price.style.display = 'none');
    }
  });
}

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

// Observe pricing cards for animation
const pricingCards = document.querySelectorAll('.pricing-card');
pricingCards.forEach((card, index) => {
  card.style.opacity = '0';
  card.style.transform = 'translateY(30px)';
  card.style.transition = `opacity 0.6s ease-out ${index * 0.15}s, transform 0.6s ease-out ${index * 0.15}s`;
  observer.observe(card);
});

// Observe FAQ items for animation
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach((item, index) => {
  item.style.opacity = '0';
  item.style.transform = 'translateY(20px)';
  item.style.transition = `opacity 0.5s ease-out ${index * 0.1}s, transform 0.5s ease-out ${index * 0.1}s`;
  observer.observe(item);
});

// Add hover effect to plan buttons
const planButtons = document.querySelectorAll('.plan-button');
planButtons.forEach(button => {
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

// Add ripple effect style
const style = document.createElement('style');
style.textContent = `
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

  .plan-button {
    position: relative;
    overflow: hidden;
  }
`;
document.head.appendChild(style);

// Track pricing page view
console.log('RealTranslate Pricing Page loaded successfully');

// Handle plan selection tracking (for analytics)
document.querySelectorAll('.plan-button').forEach(button => {
  button.addEventListener('click', function(e) {
    const planName = this.closest('.pricing-card').querySelector('.plan-name').textContent;
    console.log(`Plan selected: ${planName}`);
    // Here you can add analytics tracking code
    // e.g., gtag('event', 'plan_selected', { plan: planName });
  });
});

// Save billing preference to localStorage
if (billingToggle) {
  // Load saved preference
  const savedBilling = localStorage.getItem('billing_preference');
  if (savedBilling === 'yearly') {
    billingToggle.checked = true;
    monthlyPrices.forEach(price => price.style.display = 'none');
    yearlyPrices.forEach(price => price.style.display = 'inline');
  }

  // Save preference on change
  billingToggle.addEventListener('change', function() {
    const preference = this.checked ? 'yearly' : 'monthly';
    localStorage.setItem('billing_preference', preference);
  });
}
