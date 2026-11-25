
import { tracks } from './curriculum.js';

const departmentTracks = {
  HR: 'Human Resources Intern',
  WEB_DEV: 'Web Development Intern',
  DATA_ANALYTICS: 'Data Analyst Intern',
  BIZ_ANALYTICS: 'Business Analyst Intern',
  GRAPHIC_DESIGN: 'Graphic Designer Intern',
  CONTENT_WRITING: 'Content Writing Intern',
  DIGITAL_MARKETING: 'Digital Marketing Intern',
  SOCIAL_MEDIA: 'Social Media Intern'
};

export const recoveredTracks = Object.entries(departmentTracks).map(([departmentCode, title]) => ({
  departmentCode, title, trackKey: 'legacy-practice', exercises: tracks[title]
}));

export const recoveredTemplates = Object.fromEntries(recoveredTracks.map(({ departmentCode, exercises }) => [
  departmentCode, exercises.map(({ id, title, instructions, deliverable, rubric }) => ({
    templateKey: id, title, instructions, deliverables: deliverable, rubric, maximumScore: 100
  }))
]));
