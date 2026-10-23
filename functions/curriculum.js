"use strict";

const tracks = {
  "Business Analyst Intern": [
    {
      id: "ba-requirements-brief",
      title: "Turn a stakeholder request into a requirements brief",
      instructions: "Use a fictional campus event-booking service. Identify two user types, write a concise problem statement, map the current and proposed booking flow, and record at least six functional requirements plus three non-functional requirements. Mark assumptions and open questions instead of presenting them as facts.",
      deliverable: "A 2-4 page requirements brief with a process diagram, prioritised requirements, assumptions, and acceptance criteria for three key requirements.",
      rubric: [
        { criterion: "Problem framing and stakeholder needs", points: 30 },
        { criterion: "Requirements and acceptance criteria", points: 40 },
        { criterion: "Process diagram, assumptions, and clarity", points: 30 }
      ]
    },
    {
      id: "ba-data-backed-recommendation",
      title: "Make a data-backed product recommendation",
      instructions: "Create a small, clearly labelled fictional dataset of at least 20 booking records. Define success metrics, calculate a conversion or cancellation rate, segment the results by one useful dimension, and recommend one product change. Explain limitations and avoid claiming that synthetic results are real customer evidence.",
      deliverable: "A one-page decision memo with the dataset, metric definitions, calculations, one chart, recommendation, and limitations.",
      rubric: [
        { criterion: "Metric definitions and calculations", points: 35 },
        { criterion: "Insight quality and recommendation", points: 35 },
        { criterion: "Chart, caveats, and communication", points: 30 }
      ]
    }
  ],
  "Web Development Intern": [
    {
      id: "web-accessible-landing",
      title: "Build an accessible responsive landing page",
      instructions: "Create a semantic landing page for a fictional learning program. Include a header, course overview, benefits, a clear call to action, and a contact form with client-side validation. Support keyboard navigation, visible focus, reduced motion, and mobile layouts.",
      deliverable: "A runnable source project plus a short README, screenshots at mobile and desktop widths, and a checklist of accessibility decisions.",
      rubric: [
        { criterion: "Semantic HTML and keyboard accessibility", points: 35 },
        { criterion: "Responsive layout and visual hierarchy", points: 30 },
        { criterion: "Validation, maintainability, and README", points: 35 }
      ]
    },
    {
      id: "web-secure-api-design",
      title: "Design and test a validated task API",
      instructions: "Implement a small task API with create, list, update-status, and delete operations. Validate identifiers, text lengths, and allowed states; return consistent error responses; and ensure a caller cannot read or change another user's task. Include automated tests for invalid input and denied access.",
      deliverable: "Source code, API examples, automated tests, and a brief explanation of the ownership checks. Do not include credentials or production user data.",
      rubric: [
        { criterion: "Correct API behavior and validation", points: 35 },
        { criterion: "Ownership authorization and error handling", points: 40 },
        { criterion: "Test coverage and documentation", points: 25 }
      ]
    }
  ],
  "Data Analyst Intern": [
    {
      id: "data-cleaning-audit",
      title: "Clean and audit a messy sample dataset",
      instructions: "Create or use a clearly labelled synthetic sales dataset with at least 100 rows. Profile missing values, duplicates, inconsistent categories, and outliers. Write a repeatable cleaning script and preserve a before/after audit summary so every transformation can be explained.",
      deliverable: "The synthetic input data, cleaning script or notebook, cleaned output, and a short data-quality report with limitations.",
      rubric: [
        { criterion: "Data-quality checks and reproducibility", points: 35 },
        { criterion: "Appropriate transformations and audit trail", points: 40 },
        { criterion: "Clear report and responsible caveats", points: 25 }
      ]
    },
    {
      id: "data-insight-dashboard",
      title: "Build a decision-focused analytics dashboard",
      instructions: "Using the cleaned sample, define three business questions and matching metrics. Create a dashboard with at least three meaningful visualisations, clear units and date ranges, and filters that do not mislead. Write three evidence-based findings and one recommendation.",
      deliverable: "A dashboard file or interactive link, metric definitions, and a one-page insight summary. Label the data synthetic if applicable.",
      rubric: [
        { criterion: "Metric correctness and reproducibility", points: 35 },
        { criterion: "Visual clarity and useful interaction", points: 35 },
        { criterion: "Evidence-backed insights and caveats", points: 30 }
      ]
    }
  ],
  "Digital Marketing Intern": [
    {
      id: "marketing-campaign-brief",
      title: "Plan a measurable digital campaign",
      instructions: "Choose a fictional learning product and a defined audience. Create a campaign brief with one objective, audience insight, message, channel mix, a two-week schedule, budget assumptions, and measurable KPIs. Distinguish assumptions from validated research.",
      deliverable: "A campaign brief and channel calendar with objectives, creative direction, budget split, tracking plan, and risks.",
      rubric: [
        { criterion: "Audience insight and positioning", points: 30 },
        { criterion: "Channel plan, schedule, and budget logic", points: 35 },
        { criterion: "KPIs, tracking, and assumptions", points: 35 }
      ]
    },
    {
      id: "marketing-performance-review",
      title: "Analyse a campaign and recommend next steps",
      instructions: "Create a clearly labelled fictional campaign dataset for at least three channels. Calculate reach, click-through rate, conversion rate, and cost per conversion where applicable. Compare channels fairly, state sample-size limitations, and recommend a test rather than overclaiming causality.",
      deliverable: "A performance report with metric formulas, a comparison chart, two findings, and a prioritised experiment plan.",
      rubric: [
        { criterion: "Accurate metrics and comparisons", points: 40 },
        { criterion: "Insight quality and experiment design", points: 35 },
        { criterion: "Transparent limitations and presentation", points: 25 }
      ]
    }
  ],
  "Graphic Designer Intern": [
    {
      id: "design-mini-brand-system",
      title: "Create a consistent mini brand system",
      instructions: "Develop a visual identity for a fictional education initiative. Define the audience and design principles, then create a wordmark concept, colour palette with contrast checks, type scale, spacing guidance, and two applied examples. Do not use an existing brand's logo.",
      deliverable: "A brand board, editable source files, colour contrast notes, and two mockups showing consistent use.",
      rubric: [
        { criterion: "Distinct concept and audience fit", points: 30 },
        { criterion: "Visual consistency and craft", points: 40 },
        { criterion: "Accessibility, source files, and rationale", points: 30 }
      ]
    },
    {
      id: "design-campaign-assets",
      title: "Design a multi-format campaign asset set",
      instructions: "Create three coordinated campaign assets for social, web, and mobile placements. Adapt hierarchy and text for each size, check readability and contrast, and include safe-area guidance. Use only original or appropriately licensed assets and document their sources.",
      deliverable: "Three export-ready assets, editable files, a source/attribution note, and a short design rationale.",
      rubric: [
        { criterion: "Consistency across formats", points: 30 },
        { criterion: "Hierarchy, legibility, and accessibility", points: 40 },
        { criterion: "Production quality and asset attribution", points: 30 }
      ]
    }
  ],
  "Social Media Intern": [
    {
      id: "social-content-calendar",
      title: "Build a responsible social content calendar",
      instructions: "Plan a two-week calendar for a fictional learning community. Include platform, audience, post objective, format, draft caption, call to action, and accessibility notes for every post. Avoid fabricated testimonials, guaranteed outcomes, and misleading urgency.",
      deliverable: "A 10-post calendar, three polished sample captions, and a moderation/escalation note.",
      rubric: [
        { criterion: "Audience relevance and content variety", points: 30 },
        { criterion: "Clear, accurate copy and calls to action", points: 35 },
        { criterion: "Accessibility, moderation, and ethics", points: 35 }
      ]
    },
    {
      id: "social-engagement-report",
      title: "Turn social metrics into a learning report",
      instructions: "Use a clearly labelled fictional dataset covering at least six posts. Define engagement rate consistently, compare formats without treating correlation as causation, and propose two small experiments. Include a moderation note for a hypothetical harmful or private-data comment.",
      deliverable: "A one-page report with metric formulas, a chart, two experiments, and a concise moderation response example.",
      rubric: [
        { criterion: "Metric accuracy and fair comparisons", points: 35 },
        { criterion: "Actionable experiments", points: 30 },
        { criterion: "Responsible moderation and communication", points: 35 }
      ]
    }
  ],
  "Content Writing Intern": [
    {
      id: "writing-editorial-brief",
      title: "Prepare a research-backed editorial brief",
      instructions: "Choose a beginner-friendly technology topic. Define the reader, their question, search intent, angle, outline, and fact-checking plan. Use credible sources, link each factual claim to evidence, and flag statements that need expert review.",
      deliverable: "An editorial brief with audience, title options, structured outline, source list, and verification checklist.",
      rubric: [
        { criterion: "Audience focus and useful angle", points: 30 },
        { criterion: "Structure and editorial completeness", points: 30 },
        { criterion: "Source quality and fact-checking plan", points: 40 }
      ]
    },
    {
      id: "writing-evidence-article",
      title: "Write and edit an evidence-led explainer",
      instructions: "Write a 700-900 word explainer from your approved brief. Attribute factual claims, use plain language, distinguish opinion from fact, add descriptive headings and a useful summary, and run a final accuracy, originality, and accessibility edit.",
      deliverable: "The article, source links, a short revision note, and a checklist confirming claims and quotations were reviewed.",
      rubric: [
        { criterion: "Accuracy, evidence, and attribution", points: 40 },
        { criterion: "Structure, readability, and originality", points: 35 },
        { criterion: "Editing quality and accessibility", points: 25 }
      ]
    }
  ],
  "Human Resources Intern": [
    {
      id: "hr-candidate-journey",
      title: "Map a fair candidate journey",
      instructions: "Design a fictional internship candidate journey from application to decision. Map stages, owner, expected communication, accessibility considerations, and data collected. Include a structured interview scorecard tied to role criteria and avoid protected or irrelevant questions.",
      deliverable: "A process map, candidate communication checklist, and structured scorecard with consistent rating anchors.",
      rubric: [
        { criterion: "Clear, usable process and ownership", points: 30 },
        { criterion: "Fair, job-related evaluation design", points: 40 },
        { criterion: "Candidate communication and privacy awareness", points: 30 }
      ]
    },
    {
      id: "hr-onboarding-guide",
      title: "Create an accessible onboarding guide",
      instructions: "Prepare a first-week guide for a fictional remote intern. Include access and equipment checks, learning goals, meeting expectations, support contacts, feedback cadence, and a privacy-safe escalation path. Mark organisation-specific details as placeholders rather than inventing policies.",
      deliverable: "A concise onboarding guide, first-week schedule, and a list of details that require manager confirmation.",
      rubric: [
        { criterion: "Practical sequence and clear ownership", points: 35 },
        { criterion: "Inclusive, accessible communication", points: 30 },
        { criterion: "Realistic scope and explicit placeholders", points: 35 }
      ]
    }
  ]
};

const taskById = new Map(
  Object.entries(tracks).flatMap(([track, tasks]) =>
    tasks.map(task => [task.id, { ...task, track }])
  )
);

module.exports = { tracks, taskById };
