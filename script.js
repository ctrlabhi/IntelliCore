(function () {
      'use strict';


      /* Scroll reveal motion disabled for smoother native scrolling on desktop and mobile.
         Content remains visible; IntersectionObserver animations were causing extra paint work. */


      // Contact Us dialog controls
      const contactUsBtn = document.getElementById('contactUsBtn');
      const contactModal = document.getElementById('contactModal');
      const closeContactModal = document.getElementById('closeContactModal');
      function setContactModalOpen(isOpen) {
        if (!contactModal) return;
        contactModal.classList.toggle('active', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
        if (isOpen && closeContactModal) closeContactModal.focus();
        if (!isOpen && contactUsBtn) contactUsBtn.focus();
      }
      if (contactUsBtn) contactUsBtn.addEventListener('click', function () { setContactModalOpen(true); });
      if (closeContactModal) closeContactModal.addEventListener('click', function () { setContactModalOpen(false); });
      if (contactModal) contactModal.addEventListener('click', function (event) {
        if (event.target === contactModal) setContactModalOpen(false);
      });

      // Mobile drawer open/close controls
      const hamburgerBtn = document.getElementById('hamburgerBtn');
      const mobileDrawer = document.getElementById('mobileDrawer');
      const mobileOverlay = document.getElementById('mobileOverlay');
      const closeDrawerBtn = document.getElementById('closeDrawerBtn');

      function setMobileDrawerOpen(isOpen) {
        if (!mobileDrawer) return;
        mobileDrawer.classList.toggle('active', isOpen);
        if (mobileOverlay) mobileOverlay.classList.toggle('active', isOpen);
        if (hamburgerBtn) {
          hamburgerBtn.classList.toggle('open', isOpen);
          hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
        }
        document.body.style.overflow = isOpen ? 'hidden' : '';
      }

      if (hamburgerBtn && mobileDrawer) {
        hamburgerBtn.addEventListener('click', function (event) {
          event.stopPropagation();
          setMobileDrawerOpen(!mobileDrawer.classList.contains('active'));
        });
      }
      if (closeDrawerBtn) {
        closeDrawerBtn.addEventListener('click', function () {
          setMobileDrawerOpen(false);
        });
      }
      if (mobileOverlay) {
        mobileOverlay.addEventListener('click', function () {
          setMobileDrawerOpen(false);
        });
      }
      if (mobileDrawer) {
        mobileDrawer.querySelectorAll('.mobile-nav-link').forEach(function (link) {
          link.addEventListener('click', function () {
            setMobileDrawerOpen(false);
          });
        });
      }
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          if (contactModal && contactModal.classList.contains('active')) setContactModalOpen(false);
          if (partnershipModal && partnershipModal.classList.contains('active')) closePartnershipModal();
          if (mobileDrawer && mobileDrawer.classList.contains('active')) setMobileDrawerOpen(false);
        }
      });

// // Mobile & Desktop Menu Toggle & Close Functionality
//     const hamburgerBtn = document.getElementById('hamburgerBtn');
//     const mobileDrawer = document.getElementById('mobileDrawer');
//     const mobileOverlay = document.getElementById('mobileOverlay');
//     const closeDrawerBtn = document.getElementById('closeDrawerBtn');

//     if (hamburgerBtn && mobileDrawer) {
//         hamburgerBtn.addEventListener('click', function(e) {
//             e.stopPropagation();
//             mobileDrawer.classList.toggle('active');
//             if (mobileOverlay) mobileOverlay.classList.toggle('active');
//             hamburgerBtn.classList.toggle('open');
//         });
//     }

//     if (closeDrawerBtn && mobileDrawer) {
//         closeDrawerBtn.addEventListener('click', function() {
//             mobileDrawer.classList.remove('active');
//             if (mobileOverlay) mobileOverlay.classList.remove('active');
//             if (hamburgerBtn) hamburgerBtn.classList.remove('open');
//         });
//     }

//     if (mobileOverlay && mobileDrawer) {
//         mobileOverlay.addEventListener('click', function() {
//             mobileDrawer.classList.remove('active');
//             if (mobileOverlay) mobileOverlay.classList.remove('active');
//             if (hamburgerBtn) hamburgerBtn.classList.remove('open');
//         });
//     }
      
      /* ----------------------------------------------------------------------
         1. TOP SCROLL PROGRESS INDICATOR & 3. STICKY GLASSMORPHISM HEADER
         ---------------------------------------------------------------------- */
      const scrollProgressBar = document.getElementById('scrollProgressBar');
      const rocketRunner = document.getElementById('rocketRunner');
      const siteHeader = document.getElementById('siteHeader');
      const navLinks = document.querySelectorAll('.desktop-nav .nav-link');
      const trackedSections = ['about', 'services', 'partnership', 'vision', 'journey', 'tracks', 'gains', 'expectations', 'team', 'faq']
        .map(id => document.getElementById(id))
        .filter(Boolean);

      // Coalesce scroll work to one update per animation frame and avoid repeated layout reads.
      let scrollUiFrame = 0;
      let cachedSectionTops = [];
      let lastActiveSection = null;

      function cacheSectionPositions() {
        cachedSectionTops = trackedSections.map(function (section) {
          return { id: section.id, top: section.getBoundingClientRect().top + (window.scrollY || 0) };
        });
        scheduleScrollUI();
      }

      function scheduleScrollUI() {
        if (scrollUiFrame) return;
        scrollUiFrame = window.requestAnimationFrame(updateScrollUI);
      }

      function updateScrollUI() {
        scrollUiFrame = 0;
        const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
        const viewportWidth = window.innerWidth;
        const docHeight = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const pct = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));

        // Read layout values above, then perform visual writes.
        if (scrollProgressBar) scrollProgressBar.style.width = pct.toFixed(2) + '%';
        if (rocketRunner) {
          const rocketWidth = viewportWidth <= 600 ? 29 : 34;
          const edge = rocketWidth / 2 + 4;
          const safeTravel = Math.max(0, viewportWidth - edge * 2);
          rocketRunner.style.left = (edge + safeTravel * (pct / 100)).toFixed(1) + 'px';
        }
        if (siteHeader) siteHeader.classList.toggle('scrolled', scrollTop > 40);

        let activeId = '';
        const offsetCheck = scrollTop + 160;
        for (let i = 0; i < cachedSectionTops.length; i++) {
          if (offsetCheck >= cachedSectionTops[i].top) activeId = cachedSectionTops[i].id;
          else break;
        }
        if (activeId !== lastActiveSection) {
          lastActiveSection = activeId;
          navLinks.forEach(function (link) {
            link.classList.toggle('active', link.getAttribute('href') === '#' + activeId && !!activeId);
          });
        }
      }

      cacheSectionPositions();
      window.addEventListener('scroll', scheduleScrollUI, { passive: true });
      window.addEventListener('resize', cacheSectionPositions, { passive: true });
      window.addEventListener('load', cacheSectionPositions, { once: true });

      /* Header stays visible; no scroll-direction listener is needed. */
      if (siteHeader) siteHeader.classList.remove('header-hidden');

      /* ----------------------------------------------------------------------
         2. ANIMATED STARFIELD THROUGHOUT THE PAGE
         ---------------------------------------------------------------------- */
      const starCanvas = document.getElementById('globalStarfield');
      if (starCanvas) {
        const starCtx = starCanvas.getContext('2d');
        let stars = [];
        let starFrame = null;
        let lastStarFrame = 0;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        function resizeStarfield() {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const width = window.innerWidth;
          const height = window.innerHeight;
          starCanvas.width = Math.round(width * dpr);
          starCanvas.height = Math.round(height * dpr);
          starCanvas.style.width = width + 'px';
          starCanvas.style.height = height + 'px';
          starCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

          const count = Math.min(260, Math.max(90, Math.round((width * height) / 6200)));
          stars = Array.from({ length: count }, function (_, index) {
            const palette = ['#b9efff', '#ffffff', '#63b8ff', '#8adcf5'];
            return {
              x: Math.random() * width,
              y: Math.random() * height,
              radius: Math.random() * 1.15 + 0.25,
              speed: Math.random() * 0.12 + 0.025,
              alpha: Math.random() * 0.55 + 0.25,
              pulse: Math.random() * Math.PI * 2,
              pulseSpeed: Math.random() * 0.018 + 0.008,
              color: palette[index % palette.length]
            };
          });
        }

        function drawStarfield(timestamp) {
          starFrame = null;
          if (timestamp - lastStarFrame < 40) {
            starFrame = requestAnimationFrame(drawStarfield);
            return;
          }
          lastStarFrame = timestamp;
          starCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

          stars.forEach(function (star) {
            star.pulse += star.pulseSpeed;
            if (!reduceMotion) {
              star.y -= star.speed;
              if (star.y < -2) {
                star.y = window.innerHeight + 2;
                star.x = Math.random() * window.innerWidth;
              }
            }

            const twinkle = star.alpha + Math.sin(star.pulse) * 0.16;
            starCtx.globalAlpha = Math.max(0.08, twinkle);
            starCtx.beginPath();
            starCtx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
            starCtx.fillStyle = star.color;
            starCtx.fill();
          });

          const networkLimit = Math.min(72, stars.length);
          for (let i = 0; i < networkLimit; i++) {
            for (let j = i + 1; j < networkLimit; j++) {
              const a = stars[i];
              const b = stars[j];
              const dx = a.x - b.x;
              const dy = a.y - b.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < 138) {
                starCtx.globalAlpha = (1 - distance / 138) * 0.1;
                starCtx.beginPath();
                starCtx.strokeStyle = '#4ccfff';
                starCtx.lineWidth = 0.5;
                starCtx.moveTo(a.x, a.y);
                starCtx.lineTo(b.x, b.y);
                starCtx.stroke();
              }
            }
          }
          starCtx.globalAlpha = 1;

          if (!reduceMotion) starFrame = requestAnimationFrame(drawStarfield);
        }

        resizeStarfield();
        window.addEventListener('resize', resizeStarfield);
        if (reduceMotion) drawStarfield(performance.now());
        else starFrame = requestAnimationFrame(drawStarfield);
      }

      /* ----------------------------------------------------------------------
         2. INTERACTIVE NEURAL PARTICLE CANVAS IN HERO
         ---------------------------------------------------------------------- */
      const canvas = document.getElementById('neuralCanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        let particles = [];
        let animFrameId = null;
        let heroVisible = true;
        let lastCanvasFrame = 0;
        const mouse = { x: null, y: null, radius: 145 };

        function resizeCanvas() {
          const parent = canvas.parentElement;
          canvas.width = parent ? parent.clientWidth : window.innerWidth;
          canvas.height = parent ? parent.clientHeight : window.innerHeight;
          initParticles();
        }

        function initParticles() {
          particles = [];
          const area = canvas.width * canvas.height;
          const isMobile = window.matchMedia('(max-width: 640px)').matches;
          const count = isMobile
            ? Math.min(24, Math.max(14, Math.floor(area / 26000)))
            : Math.min(44, Math.max(24, Math.floor(area / 30000)));
          const palette = ['#00d2ff', '#3a86ff', '#05f2af', '#8338ec'];
          for (let i = 0; i < count; i++) {
            particles.push({
              x: Math.random() * canvas.width,
              y: Math.random() * canvas.height,
              vx: (Math.random() - 0.5) * 0.65,
              vy: (Math.random() - 0.5) * 0.65,
              size: Math.random() * 2.2 + 1.1,
              color: palette[i % palette.length]
            });
          }
        }

        function drawNeuralNetwork(timestamp) {
          animFrameId = null;
          if (!heroVisible || document.hidden) return;
          // A 30fps canvas animation is visually smooth but much cheaper during page scrolling.
          if (timestamp - lastCanvasFrame < 32) {
            animFrameId = requestAnimationFrame(drawNeuralNetwork);
            return;
          }
          lastCanvasFrame = timestamp;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

            if (mouse.x !== null && mouse.y !== null) {
              const dx = mouse.x - p.x;
              const dy = mouse.y - p.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < mouse.radius && dist > 0) {
                p.x -= (dx / dist) * 0.55;
                p.y -= (dy / dist) * 0.55;
              }
            }

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();

            for (let j = i + 1; j < particles.length; j++) {
              const p2 = particles[j];
              const dx = p.x - p2.x;
              const dy = p.y - p2.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              const maxDist = 135;
              if (dist < maxDist) {
                const alpha = (1 - dist / maxDist) * 0.28;
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(0, 210, 255, ' + alpha.toFixed(3) + ')';
                ctx.lineWidth = 1;
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
              }
            }
          }
          animFrameId = requestAnimationFrame(drawNeuralNetwork);
        }

        const heroSection = canvas.parentElement;
        if ('IntersectionObserver' in window && heroSection) {
          const heroObserver = new IntersectionObserver(function (entries) {
            heroVisible = entries.some(function (entry) { return entry.isIntersecting; });
            if (heroVisible && !document.hidden && !animFrameId) {
              lastCanvasFrame = 0;
              animFrameId = requestAnimationFrame(drawNeuralNetwork);
            } else if (!heroVisible && animFrameId) {
              cancelAnimationFrame(animFrameId);
              animFrameId = null;
            }
          }, { rootMargin: '100px 0px' });
          heroObserver.observe(heroSection);
        }
        document.addEventListener('visibilitychange', function () {
          if (document.hidden && animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
          } else if (!document.hidden && heroVisible && !animFrameId) {
            lastCanvasFrame = 0;
            animFrameId = requestAnimationFrame(drawNeuralNetwork);
          }
        });
        if (heroSection) {
          heroSection.addEventListener('mousemove', function (e) {
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = e.clientY - rect.top;
          });
          heroSection.addEventListener('mouseleave', function () {
            mouse.x = null;
            mouse.y = null;
          });
        }

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (!('IntersectionObserver' in window)) drawNeuralNetwork(performance.now());
        else {
          heroVisible = false;
          // Observer starts the animation only when the hero approaches the viewport.
        }
      }

      /* Mobile drawer controls are initialized above; avoid duplicate declarations. */

      /* ----------------------------------------------------------------------
         5. 9-STEP INDUCTION STEPPER / TIMELINE (#journey)
         ---------------------------------------------------------------------- */
      const inductionSteps = [
        {
          num: '01',
          tag: 'About IntelliCore',
          title: 'Who We Are',
          desc: 'IntelliCore is an emerging IT startup with a vision to build innovative technology solutions while creating opportunities for talented students and professionals to learn, grow, and contribute.',
          quote: '"We are not just building projects—we are building a strong team and a company that values innovation, collaboration, and continuous learning."',
          meta: 'Foundation & Identity',
          highlights: [
            'Emerging IT startup building modern digital solutions',
            'Opportunities for students & professionals to learn & grow',
            'Strong team culture rooted in innovation & collaboration',
            'Hands-on transition from classroom theory to live projects'
          ]
        },
        {
          num: '02',
          tag: 'Our Vision',
          title: 'Building a Brighter Tomorrow Together',
          desc: 'Our goal is to create an environment where individuals can gain real-world experience by working on live projects, improving their technical and professional skills, and preparing themselves for successful careers in the IT industry.',
          quote: '"We believe that every team member has the potential to make a meaningful impact. We encourage everyone to think creatively and take ownership."',
          meta: 'Long-Term Vision',
          highlights: [
            'Gain real-world experience working on live projects',
            'Improve both technical and professional skills',
            'Think creatively and take ownership of your work',
            'Grow alongside IntelliCore as the company scales'
          ]
        },
        {
          num: '03',
          tag: 'Our Values',
          title: 'What We Stand For',
          desc: 'These six foundational values guide everything we do as a team at IntelliCore.',
          quote: '"Integrity & Professionalism, Continuous Learning, Teamwork & Collaboration, Responsibility & Accountability, Innovation & Creativity, Respect for Everyone."',
          meta: '6 Guiding Values',
          highlights: [
            'Integrity & Professionalism + Continuous Learning',
            'Teamwork & Collaboration across all domains',
            'Responsibility, Accountability & Innovation',
            'Respect for Everyone in the IntelliCore family'
          ]
        },
        {
          num: '04',
          tag: 'About Your Internship',
          title: 'Learn. Work. Grow.',
          desc: 'Our internship program is designed to help you learn, build real-world experience, and work on meaningful projects under the guidance of industry experts.',
          quote: '"At IntelliCore, we provide a supportive environment where you can explore your interests, enhance your skills, and take the first step towards a successful career."',
          meta: '8 Specialized Roles',
          highlights: [
            'Work on real-world IT & business projects',
            'Learn directly from experienced mentors',
            'Improve technical and communication skills',
            'Collaborate across Web, Data, BA, Marketing, Design & HR'
          ]
        },
        {
          num: '05',
          tag: 'What We Expect From You',
          title: 'Your Commitment Matters',
          desc: 'As an intern at IntelliCore, your sincerity, punctuality, and positive teamwork form the backbone of your success.',
          quote: '"Be sincere and committed to your work, complete assigned tasks on time, and support your teammates positively."',
          meta: 'Intern Expectations',
          highlights: [
            'Complete assigned tasks on time & respect policies',
            'Attend meetings and maintain regular communication',
            'Ask questions whenever you need guidance',
            'Maintain strict confidentiality regarding company projects'
          ]
        },
        {
          num: '06',
          tag: 'What You Will Gain',
          title: "It's More Than Just an Internship",
          desc: 'By successfully completing this internship, you graduate with real project experience, verified credentials, and future career pathways.',
          quote: '"Outstanding contributors may also be considered for future paid roles, leadership opportunities, or long-term collaboration as IntelliCore continues to grow."',
          meta: 'Perks & Career Pathway',
          highlights: [
            'Hands-on industry experience & exposure to live projects',
            'Professional mentorship & enhanced technical/soft skills',
            'Official Internship Completion Certificate upon completion',
            'Letter of Recommendation & future paid role consideration'
          ]
        },
        {
          num: '07',
          tag: 'Communication',
          title: "We're Always Here to Support You",
          desc: 'If you face any challenges, have questions, or need support, please do not hesitate to reach out to your mentor or the management team.',
          quote: '"We believe in open communication and continuous improvement: Ask Questions, Share Your Ideas, Get Guidance, Stay Connected."',
          meta: 'Open Communication',
          highlights: [
            'Ask Questions: Reach out anytime you face challenges',
            'Share Your Ideas: Contribute creative improvements',
            'Get Guidance: 1-on-1 support from mentors & management',
            'Stay Connected: Active collaboration across the team'
          ]
        },
        {
          num: '08',
          tag: 'Our Team — Your Go-To People',
          title: 'Meet the People Behind IntelliCore',
          desc: 'Connect with our leadership and domain mentors across Management, HR, Operations, Web Development, Data Analysis, Business Analysis, and Graphic Design.',
          quote: '"Abhishek Kumar (Founder & CEO), Mahak Rawat (HR), Abhishek Diwan (Operations), Sumit Kumar (Web), Astuty Srivastava (Data), Chanda Kumawat (BA), Tara Chand Suthar (Design)."',
          meta: 'Leadership & Mentors',
          highlights: [
            'Abhishek Kumar (Founder & CEO) & Abhishek Diwan (Ops)',
            'Mahak Rawat (HR Executive — Onboarding & Support)',
            'Sumit Kumar (Web Dev) & Astuty Srivastava (Data Analyst)',
            'Chanda Kumawat (BA) & Tara Chand Suthar (Graphic Designer)'
          ]
        },
        {
          num: '09',
          tag: 'Final Message',
          title: 'A Bigger Journey Starts Here',
          desc: 'We are delighted to have you as part of IntelliCore. Every successful company begins with a dedicated team, and today, each of you is contributing to the foundation of our journey.',
          quote: '"Together, let us build something meaningful and create a future we can all be proud of. Welcome to the IntelliCore Family!"',
          meta: 'Welcome to the Family',
          highlights: [
            'Contribute directly to the foundation of our journey',
            'Stay curious, work hard, and learn continuously',
            'Build something meaningful we can all be proud of',
            'Apply Now via Google Form to begin your journey!'
          ]
        }
      ];

      let currentStepIndex = 0;
      const stepButtons = document.querySelectorAll('.step-node-btn');
      const stepperPaneContainer = document.getElementById('stepperPaneContainer');
      const stepperStatusText = document.getElementById('stepperStatusText');
      const prevStepBtn = document.getElementById('prevStepBtn');
      const nextStepBtn = document.getElementById('nextStepBtn');

      function renderStepper(index) {
        currentStepIndex = Math.max(0, Math.min(inductionSteps.length - 1, index));
        const step = inductionSteps[currentStepIndex];

        stepButtons.forEach(function (btn, idx) {
          btn.classList.toggle('active', idx === currentStepIndex);
          btn.classList.toggle('completed', idx < currentStepIndex);
        });

        const snakePath = document.getElementById('stepperSnakeProgress');
        const snakeHead = document.getElementById('stepperSnakeHead');
        if (snakePath && snakeHead) {
          const pathLength = snakePath.getTotalLength();
          const progress = currentStepIndex / (inductionSteps.length - 1);
          snakePath.style.strokeDasharray = pathLength;
          snakePath.style.strokeDashoffset = (pathLength * (1 - progress)).toFixed(2);
          const headPoint = snakePath.getPointAtLength(pathLength * progress);
          snakeHead.setAttribute('transform', 'translate(' + headPoint.x.toFixed(2) + ' ' + headPoint.y.toFixed(2) + ')');
        }

        if (stepperPaneContainer) {
          const highlightsHtml = step.highlights.map(function (item) {
            return (
              '<div class="step-highlight-item">' +
                '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
                '<span>' + item + '</span>' +
              '</div>'
            );
          }).join('');

          stepperPaneContainer.innerHTML =
            '<div class="stepper-pane">' +
              '<div>' +
                '<div class="step-badge-row">' +
                  '<span class="step-number-pill">STEP ' + step.num + ' / 09</span>' +
                  '<span class="step-category-tag">' + step.tag + '</span>' +
                '</div>' +
                '<h3 class="step-pane-title">' + step.title + '</h3>' +
                '<p class="step-pane-desc">' + step.desc + '</p>' +
                '<div class="step-highlights-list">' + highlightsHtml + '</div>' +
              '</div>' +
              '<div class="step-visual-box">' +
                '<div class="step-visual-icon">' +
                  '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>' +
                '</div>' +
                '<p class="step-visual-quote">' + step.quote + '</p>' +
                '<span class="step-visual-meta">' + step.meta + '</span>' +
              '</div>' +
            '</div>';
        }

        if (stepperStatusText) {
          const progressPct = Math.round(((currentStepIndex + 1) / inductionSteps.length) * 100);
          stepperStatusText.textContent = 'Milestone ' + step.num + ' of 09 • Induction Progress: ' + progressPct + '%';
        }
        if (prevStepBtn) prevStepBtn.disabled = currentStepIndex === 0;
        if (nextStepBtn) nextStepBtn.disabled = currentStepIndex === inductionSteps.length - 1;
      }

      stepButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          const idx = parseInt(btn.getAttribute('data-step'), 10);
          if (!isNaN(idx)) renderStepper(idx);
        });
      });

      if (prevStepBtn) {
        prevStepBtn.addEventListener('click', function () {
          if (currentStepIndex > 0) renderStepper(currentStepIndex - 1);
        });
      }
      if (nextStepBtn) {
        nextStepBtn.addEventListener('click', function () {
          if (currentStepIndex < inductionSteps.length - 1) renderStepper(currentStepIndex + 1);
        });
      }

      renderStepper(0);

      /* ----------------------------------------------------------------------
         6. INTERNSHIP TRACKS FILTER BAR (#tracks)
         ---------------------------------------------------------------------- */
      const filterPills = document.querySelectorAll('.filter-pill');
      const trackCards = document.querySelectorAll('.track-card');
      const portalTrackSelect = document.getElementById('portalTrackSelect');

      function filterTracks(category) {
        filterPills.forEach(function (pill) {
          const isActive = pill.getAttribute('data-filter') === category;
          pill.classList.toggle('active', isActive);
          pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        trackCards.forEach(function (card) {
          const cardCat = card.getAttribute('data-category');
          if (category === 'all' || cardCat === category) {
            card.classList.remove('hidden-track');
          } else {
            card.classList.add('hidden-track');
          }
        });
      }

      filterPills.forEach(function (pill) {
        pill.addEventListener('click', function () {
          const cat = pill.getAttribute('data-filter') || 'all';
          filterTracks(cat);
        });
      });

      /* ----------------------------------------------------------------------
         "WHAT YOU WILL GAIN" DETAIL POPUPS
         ---------------------------------------------------------------------- */
      const gainModal = document.getElementById('gainModal');
      const gainModalTitle = document.getElementById('gainModalTitle');
      const gainModalContent = document.getElementById('gainModalContent');
      const gainModalClose = document.getElementById('gainModalClose');
      const gainModalCloseSecondary = document.getElementById('gainModalCloseSecondary');
      let gainTrigger = null;

      const gainDetails = {
        'hands-on': {
          title: 'Hands-on Industry Experience',
          intro: 'You will learn how professional teams turn ideas into practical work. Instead of only studying concepts, you will apply your domain skills to structured startup tasks, tools, reviews, and deadlines.',
          sections: [
            ['What You Will Do', ['Work from clear briefs and real project requirements', 'Use professional tools, workflow trackers, and approved processes', 'Receive feedback through reviews, meetings, and task updates', 'Improve deliverables through testing, revision, and documentation']],
            ['Professional Practices', ['Ownership, communication, accountability, and time management', 'Version control, presentation, reporting, and quality checks where relevant', 'Collaboration with designers, developers, analysts, marketers, and mentors']]
          ]
        },
        'live-projects': {
          title: 'Exposure to Live Projects',
          intro: 'Internship assignments are designed around active IntelliCore initiatives and meaningful project deliverables. You will see how ideas move through planning, execution, review, and completion.',
          sections: [
            ['Project Exposure', ['Take part in current web, app, data, design, marketing, content, or HR work', 'Understand project goals, scope, dependencies, responsibilities, and quality expectations', 'Collaborate with teammates on deliverables that can support your portfolio']],
            ['Portfolio Value', ['Document your process and final contribution responsibly', 'Prepare work samples without exposing confidential or proprietary information', 'Build concrete examples that demonstrate practical ability to recruiters']]
          ]
        },
        'mentorship': {
          title: 'Professional Mentorship',
          intro: 'IntelliCore mentors help you understand expectations, improve your work, and build stronger professional habits throughout the internship.',
          sections: [
            ['Mentor Support', ['Clear guidance before starting assigned tasks', 'Task reviews, constructive feedback, and improvement suggestions', 'Help with tools, workflows, prioritization, and technical or domain questions', 'Career guidance based on your performance and interests']],
            ['How to Use It', ['Prepare questions and share progress regularly', 'Accept feedback with an improvement mindset', 'Track your learning, completed work, and open action items']]
          ]
        },
        'skills': {
          title: 'Enhanced Technical & Soft Skills',
          intro: 'The internship helps you develop both role-specific capabilities and workplace skills needed to perform successfully in a professional environment.',
          sections: [
            ['Technical Development', ['Strengthen tools, methods, and concepts connected to your selected internship track', 'Learn quality checks, documentation, problem-solving, and practical execution']],
            ['Professional Skills', ['Communication, active listening, teamwork, and reporting', 'Ownership, punctuality, prioritization, agile habits, and time management', 'Confidence when presenting work, receiving feedback, and solving challenges']]
          ]
        },
        'certificate': {
          title: 'Internship Completion Certificate',
          intro: 'Successful interns can receive an official IntelliCore Internship Completion Certificate after completing the program requirements and assigned work satisfactorily.',
          sections: [
            ['Certificate Eligibility', ['Complete the assigned internship tenure', 'Submit required tasks, project work, or assessments on time', 'Maintain professional communication and follow company guidelines', 'Complete the internship exit and feedback process']],
            ['What It Confirms', ['Your selected internship role and tenure', 'Successful project and learning participation', 'Validated practical contribution subject to your final performance review']]
          ]
        },
        'recommendation': {
          title: 'Letter of Recommendation',
          intro: 'A performance-based Letter of Recommendation may recognize interns who demonstrate exceptional contribution, reliability, learning, and professional growth.',
          sections: [
            ['Selection Factors', ['Quality and consistency of completed work', 'Ownership, initiative, communication, and teamwork', 'Attendance, deadlines, and adherence to professional standards', 'Positive response to feedback and continuous improvement']],
            ['How It Helps', ['Strengthens your resume, LinkedIn profile, and future applications', 'Provides credible professional feedback on your contributions', 'May highlight your strongest responsibilities and verified skills']]
          ]
        }
      };

      function setGainModalOpen(isOpen, trigger) {
        if (!gainModal) return;
        gainModal.classList.toggle('active', isOpen);
        gainModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        document.body.style.overflow = isOpen ? 'hidden' : '';
        document.querySelectorAll('.gain-card.is-touching, .comm-card.is-touching').forEach(function (card) {
          card.classList.remove('is-touching');
        });
        if (isOpen && gainModalClose) setTimeout(function () { gainModalClose.focus(); }, 50);
        if (!isOpen && trigger) trigger.focus();
      }

      function openGainModal(key, card) {
        const detail = gainDetails[key];
        if (!detail || !gainModal) return;
        gainTrigger = card;
        gainModalTitle.textContent = detail.title;
        gainModalContent.innerHTML = '<h3>Overview</h3><p>' + detail.intro + '</p>' +
          detail.sections.map(function (section) {
            return '<h3>' + section[0] + '</h3>' + listHtml(section[1]);
          }).join('');
        gainModal.querySelector('.gain-modal-card').scrollTop = 0;
        setGainModalOpen(true, card);
      }

      document.querySelectorAll('.gain-card[data-gain]').forEach(function (card) {
        const key = card.getAttribute('data-gain');
        card.addEventListener('pointerdown', function () { card.classList.add('is-touching'); });
        card.addEventListener('pointerup', function () { card.classList.remove('is-touching'); });
        card.addEventListener('pointercancel', function () { card.classList.remove('is-touching'); });
        card.addEventListener('pointerleave', function () { card.classList.remove('is-touching'); });
        card.addEventListener('touchend', function (event) {
          event.preventDefault();
          card.classList.remove('is-touching');
          openGainModal(key, card);
        }, { passive: false });
        card.addEventListener('click', function (event) {
          if (event.detail === 0 || !window.matchMedia('(pointer: coarse)').matches) {
            openGainModal(key, card);
          }
        });
        card.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openGainModal(key, card);
          }
        });
      });

      if (gainModalClose) gainModalClose.addEventListener('click', function () { setGainModalOpen(false, gainTrigger); });
      if (gainModalCloseSecondary) gainModalCloseSecondary.addEventListener('click', function () { setGainModalOpen(false, gainTrigger); });
      if (gainModal) gainModal.addEventListener('click', function (event) {
        if (event.target === gainModal) setGainModalOpen(false, gainTrigger);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && gainModal && gainModal.classList.contains('active')) {
          setGainModalOpen(false, gainTrigger);
        }
      });
      document.addEventListener('pointerup', function () {
        document.querySelectorAll('.gain-card.is-touching, .comm-card.is-touching').forEach(function (card) {
          card.classList.remove('is-touching');
        });
      });

      /* ----------------------------------------------------------------------
         COMMUNICATION & MENTOR SUPPORT DETAIL POPUPS
         ---------------------------------------------------------------------- */
      const commModal = document.getElementById('commModal');
      const commModalTitle = document.getElementById('commModalTitle');
      const commModalContent = document.getElementById('commModalContent');
      const commModalClose = document.getElementById('commModalClose');
      const commModalCloseSecondary = document.getElementById('commModalCloseSecondary');
      let commTrigger = null;

      const commDetails = {
        questions: {
          title: 'Ask Questions',
          intro: 'Questions are an important part of learning. Reach out whenever a requirement, tool, concept, deadline, or project task is unclear. Mentors want you to ask early so small blockers do not become larger problems.',
          sections: [
            ['Before You Ask', ['Read the assigned brief and review available documentation', 'Check the work you have already completed and the exact point where you are blocked', 'Try one or two relevant resources without spending excessive time stuck']],
            ['What to Share', ['Describe the task and what you are trying to achieve', 'Share the error, feedback, or unclear requirement clearly', 'Explain what you have tried and what outcome you expected', 'Attach a screenshot or relevant project excerpt only when it is appropriate and approved']],
            ['Best Practice', ['Use the official team communication channel or your mentor meeting', 'Keep messages concise, factual, respectful, and focused on the issue', 'Confirm the agreed solution and next action before closing the conversation']],
            ['Response Expectations', ['Ask non-urgent questions during normal working hours', 'Allow reasonable time for your mentor to review and respond', 'Share urgent blockers early with the correct owner and expected deadline']]
          ]
        },
        ideas: {
          title: 'Share Your Ideas',
          intro: 'Fresh perspectives are valuable at IntelliCore. You can contribute suggestions for improving design, workflows, campaigns, research, code quality, communication, or the intern experience.',
          sections: [
            ['How to Contribute', ['Prepare a clear problem statement and your proposed improvement', 'Explain the expected benefit, effort, and possible risk', 'Share examples or a simple prototype when useful']],
            ['Professional Discussion', ['Respect existing plans and project priorities', 'Listen to feedback and refine your idea collaboratively', 'Record agreed action points and ownership after team discussions']],
            ['Examples', ['Suggest a cleaner workflow or reusable project template', 'Recommend a design, content, testing, or reporting improvement', 'Propose a tool that could save time or improve quality']]
          ]
        },
        guidance: {
          title: 'Get Guidance',
          intro: 'Use structured mentor support for project direction, skill development, task feedback, and career planning. Guidance is most effective when progress and expectations are communicated regularly.',
          sections: [
            ['Mentor Sessions', ['Review task progress and completed deliverables', 'Discuss challenges and choose the next clear action', 'Ask for feedback on technical quality and professional habits', 'Clarify any domain-specific or career-related questions']],
            ['How to Prepare', ['Keep a short progress update ready', 'List specific questions before the meeting', 'Take notes and follow up on agreed commitments']],
            ['Receiving Feedback', ['Listen without interrupting and ask for examples when needed', 'Separate implementation mistakes from personal ability', 'Convert feedback into an action plan and request a follow-up review']]
          ]
        },
        connected: {
          title: 'Stay Connected',
          intro: 'Consistent communication keeps the internship team aligned. Share updates through official workspace channels, meetings, and scheduled check-ins while maintaining confidentiality.',
          sections: [
            ['Stay Updated', ['Attend scheduled team meetings and mentor check-ins', 'Respond to reasonable work messages within the agreed response time', 'Update task status, completed work, blockers, and next steps', 'Follow the communication schedule shared by your mentor or HR team']],
            ['Professional Communication', ['Use clear language and respect availability and time zones', 'Avoid sharing passwords, private data, or confidential project information publicly', 'Escalate urgent blockers through the correct communication channel']],
            ['Communication Channels', ['Use formal channels for tasks, decisions, deadlines, and feedback', 'Use calls only when conversation or real-time clarification is faster', 'Maintain a written summary of important decisions and commitments']]
          ]
        }
      };

      function setCommModalOpen(isOpen, trigger) {
        if (!commModal) return;
        commModal.classList.toggle('active', isOpen);
        commModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        document.body.style.overflow = isOpen ? 'hidden' : '';
        document.querySelectorAll('.gain-card.is-touching, .comm-card.is-touching').forEach(function (card) {
          card.classList.remove('is-touching');
        });
        if (isOpen && commModalClose) setTimeout(function () { commModalClose.focus(); }, 50);
        if (!isOpen && trigger) trigger.focus();
      }

      function openCommModal(key, card) {
        const detail = commDetails[key];
        if (!detail || !commModal) return;
        commTrigger = card;
        commModalTitle.textContent = detail.title;
        commModalContent.innerHTML = '<h3>Overview</h3><p>' + detail.intro + '</p>' +
          detail.sections.map(function (section) {
            return '<h3>' + section[0] + '</h3>' + listHtml(section[1]);
          }).join('');
        commModal.querySelector('.comm-modal-card').scrollTop = 0;
        setCommModalOpen(true, card);
      }

      document.querySelectorAll('.comm-card[data-comm]').forEach(function (card) {
        const key = card.getAttribute('data-comm');
        card.addEventListener('pointerdown', function () {
          card.classList.add('is-touching');
        });
        card.addEventListener('pointerup', function () {
          card.classList.remove('is-touching');
        });
        card.addEventListener('pointercancel', function () {
          card.classList.remove('is-touching');
        });
        card.addEventListener('pointerleave', function () {
          card.classList.remove('is-touching');
        });
        card.addEventListener('touchend', function (event) {
          event.preventDefault();
          card.classList.remove('is-touching');
          openCommModal(key, card);
        }, { passive: false });
        card.addEventListener('click', function (event) {
          if (event.detail === 0 || !window.matchMedia('(pointer: coarse)').matches) {
            openCommModal(key, card);
          }
        });
        card.addEventListener('keydown', function (event) {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openCommModal(key, card);
          }
        });
      });

      if (commModalClose) commModalClose.addEventListener('click', function () { setCommModalOpen(false, commTrigger); });
      if (commModalCloseSecondary) commModalCloseSecondary.addEventListener('click', function () { setCommModalOpen(false, commTrigger); });
      if (commModal) commModal.addEventListener('click', function (event) {
        if (event.target === commModal) setCommModalOpen(false, commTrigger);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && commModal && commModal.classList.contains('active')) {
          setCommModalOpen(false, commTrigger);
        }
      });

      const trackApplyLinks = document.querySelectorAll('.track-apply-link');
      function scrollToApplication(trackName, waitForModalClose) {
        if (trackName && portalTrackSelect) {
          portalTrackSelect.value = trackName;
          portalTrackSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        const selectedBar = document.querySelector('.selected-track-bar');
        const applyNowButton = document.getElementById('directApplyNowLink');
        const target = applyNowButton || selectedBar || document.getElementById('apply');

        if (!target) return;

        if (selectedBar) {
          selectedBar.classList.remove('track-selected-pulse');
          void selectedBar.offsetWidth;
          selectedBar.classList.add('track-selected-pulse');
          window.setTimeout(function () {
            selectedBar.classList.remove('track-selected-pulse');
          }, 1800);
        }

        if (window.location.hash !== '#apply') {
          history.replaceState(null, '', '#apply');
        }

        const performScroll = function () {
          window.requestAnimationFrame(function () {
            target.scrollIntoView({
              behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
              block: 'end',
              inline: 'nearest'
            });
          });
        };

        window.setTimeout(performScroll, waitForModalClose ? 180 : 0);
      }

      trackApplyLinks.forEach(function (link) {
        link.addEventListener('click', function (event) {
          event.preventDefault();
          const chosen = link.getAttribute('data-select-track');
          if (chosen && portalTrackSelect) {
            portalTrackSelect.value = chosen;
          }
          scrollToApplication(chosen);
        });
      });

      /* ----------------------------------------------------------------------
         INTERNSHIP JOB DESCRIPTION MODAL
         ---------------------------------------------------------------------- */
      const jdModal = document.getElementById('jdModal');
      const jdModalTitle = document.getElementById('jdModalTitle');
      const jdModalMeta = document.getElementById('jdModalMeta');
      const jdModalContent = document.getElementById('jdModalContent');
      const jdModalClose = document.getElementById('jdModalClose');
      const jdModalCloseSecondary = document.getElementById('jdModalCloseSecondary');
      const jdModalApply = document.getElementById('jdModalApply');
      let currentJdTrack = '';
      let jdCardTrigger = null;

      const internshipJDs = {
        'Human Resources Intern': {
          about: 'IntelliCore is a growing IT company building innovative digital solutions worldwide. The Human Resources Intern will support recruitment, onboarding, employee engagement, and everyday HR operations in a dynamic remote startup environment.',
          responsibilities: ['Assist with end-to-end recruitment, including sourcing, screening, and interview scheduling', 'Post openings on LinkedIn, job portals, and recruitment platforms', 'Coordinate candidates and hiring managers throughout the hiring process', 'Maintain candidate databases, HR records, and recruitment trackers', 'Support onboarding, orientation, and employee engagement activities', 'Draft offer letters, internship letters, and HR documents', 'Help with employer branding and administrative HR operations'],
          eligibility: ['Students, freshers, or graduates from HR, BBA, MBA, B.Com, Psychology, Management, or related fields', 'Strong written and verbal communication skills', 'Organized, detail-oriented, and comfortable managing multiple tasks', 'Familiarity with MS Excel, Google Workspace, or HR tools is an advantage'],
          gains: ['Internship Completion Certificate', 'Performance-based Letter of Recommendation', 'Practical IT recruitment and HR operations experience', 'Flexible remote hours and professional mentorship']
        },
        'Business Analyst Intern': {
          about: 'The Business Analyst Intern bridges business needs and technology teams. You will document requirements, analyze data, support solution planning, and help convert project ideas into clear, practical deliverables.',
          responsibilities: ['Gather and document business requirements through calls, research, and stakeholder meetings', 'Create BRD, FRD, use cases, process flows, and user stories', 'Analyze business data to identify trends, gaps, and improvement opportunities', 'Work with developers and designers to clarify requirements and solution scope', 'Support sprint planning, backlog review, testing, and change documentation', 'Prepare reports, presentations, and client-ready project updates'],
          eligibility: ['Students or graduates from Business, Management, IT, Economics, Commerce, or related fields', 'Strong analytical, documentation, and communication skills', 'Basic knowledge of Excel, PowerPoint, SQL, or Jira is an advantage', 'Interest in software products and solving real business problems'],
          gains: ['Internship Completion Certificate', 'Hands-on experience across the complete business analysis lifecycle', 'Exposure to product, technology, and client communication', 'Mentorship and performance-based recommendation']
        },
        'Web Development Intern': {
          about: 'Join IntelliCore as a Web Development Intern and build responsive, accessible web experiences. You will work alongside designers and senior developers on real production-oriented projects using modern web technologies.',
          responsibilities: ['Build responsive interfaces using HTML, CSS, and JavaScript', 'Integrate frontend components with APIs and existing backend services', 'Fix bugs, improve performance, accessibility, and cross-browser compatibility', 'Participate in code reviews, Git workflows, and sprint discussions', 'Test features across desktop and mobile devices', 'Document implementation details and reusable components'],
          eligibility: ['Students or graduates with basic frontend or full-stack development knowledge', 'Familiarity with HTML, CSS, JavaScript; React, Node.js, or databases are beneficial', 'Understanding of Git, APIs, responsive design, or debugging is a plus', 'A learning mindset, ownership, and ability to work remotely'],
          gains: ['Internship Completion Certificate', 'Real project and portfolio experience', 'Guidance on clean code, Git, testing, and deployment', 'Performance-based Letter of Recommendation']
        },
        'Data Analyst Intern': {
          about: 'The Data Analyst Intern helps IntelliCore transform raw data into useful business insights. You will clean datasets, build reports, create dashboards, and communicate findings that support product and business decisions.',
          responsibilities: ['Collect, clean, validate, and organize datasets from multiple sources', 'Perform exploratory analysis and identify meaningful trends or anomalies', 'Create dashboards and reports using Excel, Power BI, Tableau, or similar tools', 'Write SQL queries to extract and analyze data', 'Support KPI tracking, data documentation, and presentation of insights', 'Work with stakeholders to define metrics and answer business questions'],
          eligibility: ['Students or graduates from Data Science, Statistics, Mathematics, IT, Commerce, or related fields', 'Working knowledge of Excel and any BI or visualization tool', 'Basic SQL and analytical reasoning skills', 'Curiosity, attention to detail, and clear communication'],
          gains: ['Internship Completion Certificate', 'Hands-on dashboards, reporting, and SQL experience', 'Exposure to practical business metrics and data workflows', 'Mentorship and recommendation based on performance']
        },
        'Digital Marketing Intern': {
          about: 'As a Digital Marketing Intern, you will support IntelliCore campaigns across search, social, email, and content channels. The role combines creativity with analytical thinking to grow awareness, engagement, and qualified leads.',
          responsibilities: ['Plan and execute digital campaigns across LinkedIn, Instagram, and Google channels', 'Research keywords, competitors, audience segments, and market trends', 'Create campaign briefs, ad copy, landing-page content, and performance reports', 'Assist with SEO, content calendars, email marketing, and lead tracking', 'Monitor campaign metrics and suggest data-driven optimizations', 'Coordinate with design and content teams for brand-consistent assets'],
          eligibility: ['Students or graduates from Marketing, Business, Communications, or related fields', 'Understanding of social media, content marketing, SEO, or paid advertising', 'Good writing skills and familiarity with analytics tools are helpful', 'Creative, organized, and comfortable with measurable goals'],
          gains: ['Internship Completion Certificate', 'Live campaign and analytics experience', 'Portfolio-ready case studies and measurable achievements', 'Performance-based recommendation and flexible remote work']
        },
        'Graphic Designer Intern': {
          about: 'The Graphic Designer Intern creates clear, modern visual communication for IntelliCore projects and campaigns. You will turn ideas into polished graphics while learning brand consistency, design systems, and production workflows.',
          responsibilities: ['Design social posts, banners, presentations, brochures, and marketing creatives', 'Create visuals that follow IntelliCore branding and accessibility guidelines', 'Develop layout concepts, illustrations, icons, and reusable design assets', 'Collaborate with marketing, content, and development teams', 'Prepare final files in suitable formats and maintain organized source assets', 'Iterate designs using feedback and present your creative decisions'],
          eligibility: ['Students or beginners in Graphic Design, Multimedia, Fine Arts, or related disciplines', 'Working knowledge of Canva, Figma, Photoshop, Illustrator, or similar tools', 'Strong eye for typography, color, layout, and visual hierarchy', 'Basic motion or UI design skills are helpful but not mandatory'],
          gains: ['Internship Completion Certificate', 'A professional portfolio with real brand projects', 'Feedback from marketing and design professionals', 'Performance-based recommendation']
        },
        'Social Media Intern': {
          about: 'The Social Media Intern manages day-to-day content and community activity across IntelliCore channels. You will build an engaging online presence through planned posts, trend research, community support, and performance analysis.',
          responsibilities: ['Create and maintain social media content calendars', 'Write captions, schedule posts, and publish platform-appropriate content', 'Research trends, hashtags, audiences, and engagement opportunities', 'Respond to comments and messages professionally', 'Track reach, engagement, followers, clicks, and conversions', 'Suggest campaign and content ideas based on performance insights'],
          eligibility: ['Students or graduates from Marketing, Media, Communications, or related fields', 'Strong writing skills and familiarity with major social platforms', 'Basic knowledge of Canva, analytics, scheduling tools, or short-form video', 'Creative, responsive, consistent, and comfortable working remotely'],
          gains: ['Internship Completion Certificate', 'Hands-on social media planning and community management', 'Content portfolio and analytics experience', 'Mentorship and recommendation based on performance']
        },
        'Content Writing Intern': {
          about: 'The Content Writing Intern develops clear, useful, and search-friendly content for IntelliCore websites, campaigns, and social channels. You will research topics, adapt tone by audience, and collaborate on content that communicates technical ideas simply.',
          responsibilities: ['Research and write blogs, website copy, social posts, and campaign content', 'Adapt content for brand voice, target audience, and search intent', 'Proofread and edit articles for clarity, grammar, consistency, and accuracy', 'Perform basic keyword and competitor research for content planning', 'Coordinate headlines, metadata, visuals, and publishing requirements with teams', 'Track content feedback and improve drafts through revisions'],
          eligibility: ['Students or graduates from English, Journalism, Communications, Marketing, or related fields', 'Excellent written English and strong research skills', 'Basic understanding of SEO and content tools is an advantage', 'Attention to deadlines, detail, and feedback'],
          gains: ['Internship Completion Certificate', 'Published content and a professional writing portfolio', 'SEO, brand writing, and editorial workflow experience', 'Flexible remote work and performance-based recommendation']
        }
      };

      function listHtml(items) {
        return '<ul>' + items.map(function (item) {
          return '<li>' + item.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</li>';
        }).join('') + '</ul>';
      }

      function setJdModalOpen(isOpen, card) {
        if (!jdModal) return;
        jdModal.classList.toggle('active', isOpen);
        jdModal.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        document.body.style.overflow = isOpen ? 'hidden' : '';
        if (isOpen && jdModalClose) {
          jdModal.querySelector('.jd-modal-card').scrollTop = 0;
          setTimeout(function () { jdModalClose.focus(); }, 50);
        } else if (!isOpen && card) {
          card.focus();
        }
      }

      function openJdModal(trackName, card) {
        const jd = internshipJDs[trackName];
        if (!jd || !jdModal) return;
        currentJdTrack = trackName;
        jdCardTrigger = card;
        jdModalTitle.textContent = trackName;
        jdModalMeta.innerHTML = [
          '<div class="jd-meta-item"><span>Location</span><strong>Remote</strong></div>',
          '<div class="jd-meta-item"><span>Duration</span><strong>3–6 Months</strong></div>',
          '<div class="jd-meta-item"><span>Start Date</span><strong>Immediate</strong></div>',
          '<div class="jd-meta-item"><span>Stipend</span><strong>Unpaid</strong></div>'
        ].join('');
        jdModalContent.innerHTML =
          '<h3>About the Role</h3><p>' + jd.about + '</p>' +
          '<h3>Key Responsibilities</h3>' + listHtml(jd.responsibilities) +
          '<h3>Who Can Apply</h3>' + listHtml(jd.eligibility) +
          '<h3>What You&apos;ll Gain</h3>' + listHtml(jd.gains) +
          '<h3>Why Join IntelliCore?</h3><p>Work with a fast-growing technology startup, build real-world experience, receive mentorship, and contribute to meaningful projects while developing career-ready skills.</p>';
        setJdModalOpen(true, card);
      }

      trackCards.forEach(function (card) {
        const trackName = card.getAttribute('data-track-name');
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', 'Open full job description for ' + trackName);
        card.addEventListener('click', function (event) {
          if (!event.target.closest('.track-apply-link')) openJdModal(trackName, card);
        });
        card.addEventListener('keydown', function (event) {
          if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('.track-apply-link')) {
            event.preventDefault();
            openJdModal(trackName, card);
          }
        });
      });

      if (jdModalClose) jdModalClose.addEventListener('click', function () { setJdModalOpen(false, jdCardTrigger); });
      if (jdModalCloseSecondary) jdModalCloseSecondary.addEventListener('click', function () { setJdModalOpen(false, jdCardTrigger); });
      if (jdModal) jdModal.addEventListener('click', function (event) {
        if (event.target === jdModal) setJdModalOpen(false, jdCardTrigger);
      });
      if (jdModalApply) jdModalApply.addEventListener('click', function () {
        if (currentJdTrack && portalTrackSelect) portalTrackSelect.value = currentJdTrack;
        setJdModalOpen(false, jdCardTrigger);
        scrollToApplication(currentJdTrack, true);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && jdModal && jdModal.classList.contains('active')) {
          setJdModalOpen(false, jdCardTrigger);
        }
      });

      const footerTrackLinks = document.querySelectorAll('[data-footer-track]');
      footerTrackLinks.forEach(function (link) {
        link.addEventListener('click', function () {
          const cat = link.getAttribute('data-footer-track');
          if (cat) filterTracks(cat);
        });
      });

      /* ----------------------------------------------------------------------
         7. INTERACTIVE INTERN COMMITMENT CHECKLIST / PLEDGE TRACKER
         ---------------------------------------------------------------------- */
      const pledgeItems = document.querySelectorAll('.pledge-item');
      const pledgeCounterText = document.getElementById('pledgeCounterText');
      const pledgePercentText = document.getElementById('pledgePercentText');
      const pledgeRingProgress = document.getElementById('pledgeRingProgress');
      const pledgeSuccessBadge = document.getElementById('pledgeSuccessBadge');
      const pledgeHelperText = document.getElementById('pledgeHelperText');
      const acknowledgeAllBtn = document.getElementById('acknowledgeAllBtn');
      const resetPledgeBtn = document.getElementById('resetPledgeBtn');
      const totalPledges = pledgeItems.length;
      const circumference = 339.292;

      function updatePledgeScore() {
        const checkedCount = document.querySelectorAll('.pledge-item.checked').length;
        const pct = Math.round((checkedCount / totalPledges) * 100);

        if (pledgeCounterText) {
          pledgeCounterText.textContent = checkedCount + ' of ' + totalPledges + ' commitments acknowledged';
        }
        if (pledgePercentText) {
          pledgePercentText.textContent = pct + '%';
        }
        if (pledgeRingProgress) {
          const offset = circumference - (checkedCount / totalPledges) * circumference;
          pledgeRingProgress.style.strokeDashoffset = offset.toFixed(2);
        }
        if (pledgeSuccessBadge && pledgeHelperText) {
          if (checkedCount === totalPledges) {
            pledgeSuccessBadge.classList.add('visible');
            pledgeHelperText.textContent = 'All 6 commitments verified! Click "Apply Now" below to submit your Google Form.';
          } else {
            pledgeSuccessBadge.classList.remove('visible');
            pledgeHelperText.textContent = 'Check all 6 commitments on the left to confirm your readiness before applying via the Google Form below.';
          }
        }
      }

      pledgeItems.forEach(function (item) {
        item.addEventListener('click', function () {
          const isChecked = item.classList.toggle('checked');
          item.setAttribute('aria-pressed', isChecked ? 'true' : 'false');
          updatePledgeScore();
        });
      });

      if (acknowledgeAllBtn) {
        acknowledgeAllBtn.addEventListener('click', function () {
          pledgeItems.forEach(function (item) {
            item.classList.add('checked');
            item.setAttribute('aria-pressed', 'true');
          });
          updatePledgeScore();
        });
      }

      if (resetPledgeBtn) {
        resetPledgeBtn.addEventListener('click', function () {
          pledgeItems.forEach(function (item) {
            item.classList.remove('checked');
            item.setAttribute('aria-pressed', 'false');
          });
          updatePledgeScore();
        });
      }

      /* ----------------------------------------------------------------------
         8. EXPANDABLE FAQ ACCORDION (ONE-AT-A-TIME)
         ---------------------------------------------------------------------- */
      const faqItems = document.querySelectorAll('.faq-item');
      faqItems.forEach(function (item) {
        const btn = item.querySelector('.faq-question-btn');
        const answerWrap = item.querySelector('.faq-answer-wrap');
        if (!btn || !answerWrap) return;

        btn.addEventListener('click', function () {
          const isCurrentlyOpen = item.classList.contains('open');

          faqItems.forEach(function (otherItem) {
            otherItem.classList.remove('open');
            const otherBtn = otherItem.querySelector('.faq-question-btn');
            const otherWrap = otherItem.querySelector('.faq-answer-wrap');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
            if (otherWrap) otherWrap.style.maxHeight = '0px';
          });

          if (!isCurrentlyOpen) {
            item.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            answerWrap.style.maxHeight = answerWrap.scrollHeight + 24 + 'px';
          }
        });
      });

      /* Partnership category dialogs */
      const partnershipModal = document.getElementById('partnershipModal');
      const partnershipModalClose = document.getElementById('partnershipModalClose');
      const partnershipModalSecondary = document.getElementById('partnershipModalSecondary');
      const partnershipModalTitle = document.getElementById('partnershipModalTitle');
      const partnershipModalContent = document.getElementById('partnershipModalContent');
      const partnershipModalIcon = document.getElementById('partnershipModalIcon');
      const partnershipEmailLink = document.getElementById('partnershipEmailLink');
      let partnershipTrigger = null;

      const partnershipDetails = {
        'Technology Partnership': {
          about: 'Collaborate with IntelliCore to align complementary technology capabilities and deliver stronger technical solutions.',
          opportunities: ['Technology integration', 'Technical expertise sharing', 'Joint technology solutions', 'Innovation initiatives', 'Technical collaboration'],
          offer: ['Collaborative technical planning', 'Software and integration expertise', 'Project execution support', 'Clear communication and shared delivery processes'],
          benefits: ['Expanded technology capability', 'Shared innovation opportunities', 'Access to complementary expertise', 'Potential for scalable long-term collaboration'],
          together: ['Define technical objectives and integration scope', 'Assign responsibilities and milestones', 'Review progress through structured collaboration', 'Plan continued initiatives based on project outcomes']
        },
        'Development Partnership': {
          about: 'Build digital products together through structured software development collaboration across web, mobile and custom systems.',
          opportunities: ['Website development', 'Mobile application development', 'Custom software development', 'Project outsourcing', 'Joint project execution'],
          offer: ['Product and technical planning', 'Web and application engineering support', 'Defined delivery workflows', 'Transparent project coordination'],
          benefits: ['Flexible development capacity', 'Shared project ownership', 'Consistent technical collaboration', 'Opportunities to expand solution delivery'],
          together: ['Discuss requirements and delivery scope', 'Agree on roles, technology and milestones', 'Execute development with regular reviews', 'Support launch, refinement and next phases']
        },
        'Educational Partnership': {
          about: 'Create practical learning pathways that connect educational communities with technology, industry practices and project-based learning.',
          opportunities: ['College and university tie-ups', 'Internship opportunities', 'Technical workshops', 'Student development programs', 'Industry-oriented projects'],
          offer: ['Industry-aligned learning sessions', 'Practical project guidance', 'Program and workshop collaboration', 'Mentorship-oriented engagement'],
          benefits: ['Relevant practical exposure for students', 'Industry-academic collaboration opportunities', 'Flexible program structures', 'Shared growth in technical education'],
          together: ['Identify institution goals and learner needs', 'Design a suitable program or workshop format', 'Define schedules, resources and responsibilities', 'Review outcomes and explore future programs']
        },
        'Marketing & Referral Partnership': {
          about: 'Explore mutually aligned marketing and referral collaboration that creates business opportunities while respecting transparent commercial arrangements.',
          opportunities: ['Business referrals', 'Lead sharing', 'Digital marketing collaboration', 'Joint promotional campaigns', 'Mutually agreed referral arrangements'],
          offer: ['Campaign coordination support', 'Qualified opportunity communication', 'Marketing collaboration planning', 'Clear agreement-based referral processes'],
          benefits: ['Expanded business reach', 'Shared promotional opportunities', 'Transparent lead collaboration', 'Potential for recurring referral relationships'],
          together: ['Agree on audience and referral fit', 'Define campaign or lead-sharing terms', 'Coordinate communications responsibly', 'Measure and review collaboration outcomes']
        },
        'Startup Collaboration': {
          about: 'Support startups with practical technology planning and development from early product concepts through application delivery.',
          opportunities: ['MVP development', 'Product development', 'Technical consultation', 'Application development', 'Startup technology support'],
          offer: ['Product discovery and technical guidance', 'MVP and application implementation', 'Scalable development planning', 'Iterative collaboration and review'],
          benefits: ['Focused technology support', 'Flexible engagement models', 'Early-stage implementation guidance', 'Pathways for product iteration and growth'],
          together: ['Clarify product vision and current stage', 'Prioritize the initial build scope', 'Agree on delivery and review cycles', 'Plan ongoing product improvements']
        },
        'Corporate Partnership': {
          about: 'Partner with IntelliCore on enterprise initiatives, digital transformation and dependable long-term technology support.',
          opportunities: ['Enterprise software solutions', 'Business automation', 'Long-term technology support', 'Digital transformation', 'Enterprise project collaboration'],
          offer: ['Enterprise solution planning', 'Business process automation support', 'Project governance and communication', 'Technology delivery and ongoing collaboration'],
          benefits: ['Structured technology engagement', 'Flexible project collaboration', 'Improved digital process opportunities', 'Long-term support planning'],
          together: ['Assess business and technology priorities', 'Define scope, governance and success criteria', 'Plan phased delivery and communication', 'Support implementation and future initiatives']
        }
      };

      function partnershipList(items) {
        return '<ul>' + items.map(function (item) {
          return '<li>' + item.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</li>';
        }).join('') + '</ul>';
      }

      function closePartnershipModal() {
        if (!partnershipModal) return;
        partnershipModal.classList.remove('active');
        partnershipModal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        if (partnershipTrigger) partnershipTrigger.focus();
      }

      function openPartnershipModal(category, trigger) {
        const detail = partnershipDetails[category];
        if (!detail || !partnershipModal) return;
        partnershipTrigger = trigger;
        partnershipModalTitle.textContent = category;
        if (partnershipModalIcon && trigger) {
          const cardIcon = trigger.closest('.partnership-card')?.querySelector('.partnership-icon');
          partnershipModalIcon.innerHTML = '';
          if (cardIcon) partnershipModalIcon.appendChild(cardIcon.querySelector('svg').cloneNode(true));
        }
        partnershipModalContent.innerHTML =
          '<section><h3>About This Partnership</h3><p>' + detail.about + '</p></section>' +
          '<section><h3>Collaboration Opportunities</h3>' + partnershipList(detail.opportunities) + '</section>' +
          '<section><h3>What We Can Offer</h3>' + partnershipList(detail.offer) + '</section>' +
          '<section><h3>Benefits of Partnership</h3>' + partnershipList(detail.benefits) + '</section>' +
          '<section><h3>How We Can Work Together</h3>' + partnershipList(detail.together) + '</section>';

        const subject = 'Partnership Inquiry - ' + category;
        const body = 'Dear IntelliCore Team,\n\nWe are interested in exploring a potential partnership with IntelliCore.\n\nOrganization Name:\nContact Person:\nOrganization Website:\nPartnership Category: ' + category + '\nProposed Collaboration:\n\nWe would appreciate an opportunity to discuss potential collaboration.\n\nRegards,\n[Your Name]';
        partnershipEmailLink.href = 'mailto:info@intellicoretechnologies.in?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        const partnershipModalEmail = partnershipModal.querySelector('.partnership-modal-email');
        if (partnershipModalEmail) partnershipModalEmail.href = partnershipEmailLink.href;
        partnershipModal.classList.add('active');
        partnershipModal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        const partnershipModalScroll = partnershipModal.querySelector('.partnership-modal-scroll');
        if (partnershipModalScroll) partnershipModalScroll.scrollTop = 0;
        setTimeout(function () { partnershipModalClose.focus(); }, 50);
      }

      if (partnershipModalClose) partnershipModalClose.addEventListener('click', closePartnershipModal);
      if (partnershipModalSecondary) partnershipModalSecondary.addEventListener('click', closePartnershipModal);
      if (partnershipModal) partnershipModal.addEventListener('click', function (event) {
        if (event.target === partnershipModal) closePartnershipModal();
      });

      /* ----------------------------------------------------------------------
         TEAM ROSTER TOGGLE (ALL 7 VISIBLE BY DEFAULT <-> CORE LEADERSHIP 4)
         ---------------------------------------------------------------------- */
      const toggleAllTeamBtn = document.getElementById('toggleAllTeamBtn');
      const extraMentors = document.querySelectorAll('.extra-mentor');
      let showingAllMentors = true;

      if (toggleAllTeamBtn) {
        toggleAllTeamBtn.addEventListener('click', function () {
          showingAllMentors = !showingAllMentors;
          extraMentors.forEach(function (card) {
            card.classList.toggle('hidden-mentor', !showingAllMentors);
          });
          toggleAllTeamBtn.innerHTML = showingAllMentors
            ? '<span>View All 7 Induction Deck Mentors</span>'
            : '<span>Show All 7 IntelliCore Team Members</span>';
        });
      }



      /* ----------------------------------------------------------------------
         PRIVACY & TERMS MODAL
         ---------------------------------------------------------------------- */
      const policyModal = document.getElementById('policyModal');
      const closePolicyModalBtn = document.getElementById('closePolicyModalBtn');
      const openPrivacyBtn = document.getElementById('openPrivacyBtn');
      const openTermsBtn = document.getElementById('openTermsBtn');
      const policyModalTitle = document.getElementById('policyModalTitle');
      const policyModalBody = document.getElementById('policyModalBody');

      if (openPrivacyBtn && policyModal) {
        openPrivacyBtn.addEventListener('click', function () {
          policyModalTitle.textContent = 'IntelliCore Candidate Privacy Policy';
          policyModalBody.innerHTML =
            '<p style="margin-bottom:0.75rem;">IntelliCore collects candidate information through our official application portal strictly for evaluating internship applications, issuing verified Internship Completion Certificates, and facilitating mentor onboarding.</p>' +
            '<p>We never sell or share candidate data with third parties. All internal project repositories and applicant records are safeguarded under strict access controls.</p>';
          policyModal.classList.add('active');
        });
      }

      if (openTermsBtn && policyModal) {
        openTermsBtn.addEventListener('click', function () {
          policyModalTitle.textContent = 'Internship Terms & Code of Conduct';
          policyModalBody.innerHTML =
            '<p style="margin-bottom:0.75rem;">By participating in the IntelliCore Internship Program, interns agree to uphold our 6 Core Values: Integrity & Professionalism, Continuous Learning, Teamwork & Collaboration, Responsibility & Accountability, Innovation & Creativity, and Respect for Everyone.</p>' +
            '<p>Interns must maintain confidentiality regarding company projects and information, attend scheduled meetings, and complete assigned tasks on time to qualify for the Internship Completion Certificate and Letter of Recommendation.</p>';
          policyModal.classList.add('active');
        });
      }

      if (closePolicyModalBtn && policyModal) {
        closePolicyModalBtn.addEventListener('click', function () {
          policyModal.classList.remove('active');
        });
      }

      if (policyModal) {
        policyModal.addEventListener('click', function (e) {
          if (e.target === policyModal) policyModal.classList.remove('active');
        });
      }
      const backToTopBtn = document.getElementById('backToTopBtn');
      if (backToTopBtn) {
        function updateBackToTop() {
          backToTopBtn.classList.toggle('visible', window.scrollY > 550);
        }
        window.addEventListener('scroll', updateBackToTop, { passive: true });
        updateBackToTop();
        backToTopBtn.addEventListener('click', function () {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      }

    })();
