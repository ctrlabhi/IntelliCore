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
      const trackedSections = ['about', 'services', 'vision', 'journey', 'tracks', 'gains', 'expectations', 'team', 'faq']
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
            'Official Experience Certificate upon completion',
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
          pill.classList.toggle('active', pill.getAttribute('data-filter') === category);
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

      const trackApplyLinks = document.querySelectorAll('.track-apply-link');
      trackApplyLinks.forEach(function (link) {
        link.addEventListener('click', function () {
          const chosen = link.getAttribute('data-select-track');
          if (chosen && portalTrackSelect) {
            portalTrackSelect.value = chosen;
          }
        });
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
            '<p style="margin-bottom:0.75rem;">IntelliCore collects candidate information through our official application portal strictly for evaluating internship applications, issuing verified Experience Certificates, and facilitating mentor onboarding.</p>' +
            '<p>We never sell or share candidate data with third parties. All internal project repositories and applicant records are safeguarded under strict access controls.</p>';
          policyModal.classList.add('active');
        });
      }

      if (openTermsBtn && policyModal) {
        openTermsBtn.addEventListener('click', function () {
          policyModalTitle.textContent = 'Internship Terms & Code of Conduct';
          policyModalBody.innerHTML =
            '<p style="margin-bottom:0.75rem;">By participating in the IntelliCore Internship Program, interns agree to uphold our 6 Core Values: Integrity & Professionalism, Continuous Learning, Teamwork & Collaboration, Responsibility & Accountability, Innovation & Creativity, and Respect for Everyone.</p>' +
            '<p>Interns must maintain confidentiality regarding company projects and information, attend scheduled meetings, and complete assigned tasks on time to qualify for the Experience Certificate and Letter of Recommendation.</p>';
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
    })();
