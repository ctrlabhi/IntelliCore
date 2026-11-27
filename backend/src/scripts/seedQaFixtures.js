/**
 * IntelliCore QA Test Environment Fixture Seeder
 * Populates isolated test schema with rich synthetic data across all 8 roles and lifecycle records.
 * Strictly uses @intellicore.test reserved synthetic email addresses.
 */

import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || (!databaseUrl.includes('intellicore_qa_db') && !databaseUrl.includes('intellicore_test'))) {
  console.error('❌ Refusing to run QA fixture seeder against non-QA database.');
  process.exit(1);
}

const prisma = new PrismaClient();

async function seedQa() {
  console.log('🚀 Seeding rich QA fixtures into isolated database...');

  // 1. Resolve Roles
  const roles = await prisma.role.findMany();
  const roleMap = new Map(roles.map(r => [r.code, r]));

  // 2. Resolve Departments
  const departments = await prisma.department.findMany();
  const deptMap = new Map(departments.map(d => [d.code, d]));
  const webDevDept = deptMap.get('WEB_DEV') || departments[0];
  const hrDept = deptMap.get('HR') || departments[1] || departments[0];

  // Helper to create synthetic user with profile and role
  async function createSyntheticUser(data) {
    const { uid, email, fullName, roleCode, status = 'ACTIVE', deptCode } = data;
    const user = await prisma.user.upsert({
      where: { email },
      update: { status, emailVerified: true },
      create: {
        firebaseUid: uid,
        email,
        status,
        emailVerified: true,
        profile: {
          create: { fullName, displayName: fullName.split(' ')[0] }
        }
      }
    });

    const role = roleMap.get(roleCode);
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id }
      });
    }

    if (deptCode && deptMap.has(deptCode)) {
      const dept = deptMap.get(deptCode);
      const assignedRole = roleCode === 'INTERN' ? 'INTERN' : (roleCode === 'TEAM_LEADER' ? 'TEAM_LEADER' : 'STAFF');
      await prisma.userDepartment.upsert({
        where: { userId_departmentId_assignedRole: { userId: user.id, departmentId: dept.id, assignedRole } },
        update: {},
        create: { userId: user.id, departmentId: dept.id, assignedRole, isActive: true }
      });
    }

    return user;
  }

  // 3. Create Synthetic Identities for All 8 Roles
  const founder = await createSyntheticUser({
    uid: 'qa-uid-founder', email: 'qa.founder@intellicore.test',
    fullName: 'Dr. QA Founder', roleCode: 'FOUNDER'
  });

  const cofounder = await createSyntheticUser({
    uid: 'qa-uid-cofounder', email: 'qa.cofounder@intellicore.test',
    fullName: 'QA Co-Founder', roleCode: 'CO_FOUNDER'
  });

  const admin = await createSyntheticUser({
    uid: 'qa-uid-admin', email: 'qa.admin@intellicore.test',
    fullName: 'QA System Admin', roleCode: 'ADMIN'
  });

  const hrManager = await createSyntheticUser({
    uid: 'qa-uid-hrmanager', email: 'qa.hrmanager@intellicore.test',
    fullName: 'QA HR Manager', roleCode: 'HR_MANAGER', deptCode: 'HR'
  });

  const hrExec = await createSyntheticUser({
    uid: 'qa-uid-hrexec', email: 'qa.hrexec@intellicore.test',
    fullName: 'QA HR Executive', roleCode: 'HR_EXECUTIVE', deptCode: 'HR'
  });

  const opsExec = await createSyntheticUser({
    uid: 'qa-uid-opsexec', email: 'qa.opsexec@intellicore.test',
    fullName: 'QA Operations Exec', roleCode: 'OPERATIONS_EXECUTIVE'
  });

  const teamLead = await createSyntheticUser({
    uid: 'qa-uid-teamlead', email: 'qa.teamlead@intellicore.test',
    fullName: 'QA Team Leader', roleCode: 'TEAM_LEADER', deptCode: 'WEB_DEV'
  });

  const activeInternUser = await createSyntheticUser({
    uid: 'qa-uid-intern-active', email: 'qa.intern.active@intellicore.test',
    fullName: 'Active Intern Alpha', roleCode: 'INTERN', deptCode: 'WEB_DEV'
  });

  const completedInternUser = await createSyntheticUser({
    uid: 'qa-uid-intern-completed', email: 'qa.intern.completed@intellicore.test',
    fullName: 'Completed Intern Beta', roleCode: 'INTERN', deptCode: 'WEB_DEV'
  });

  const extendedInternUser = await createSyntheticUser({
    uid: 'qa-uid-intern-extended', email: 'qa.intern.extended@intellicore.test',
    fullName: 'Extended Intern Gamma', roleCode: 'INTERN', deptCode: 'WEB_DEV'
  });

  const promotedInternUser = await createSyntheticUser({
    uid: 'qa-uid-intern-promoted', email: 'qa.intern.promoted@intellicore.test',
    fullName: 'Promoted Intern Delta', roleCode: 'INTERN', deptCode: 'WEB_DEV'
  });

  const suspendedInternUser = await createSyntheticUser({
    uid: 'qa-uid-intern-suspended', email: 'qa.intern.suspended@intellicore.test',
    fullName: 'Suspended Intern Epsilon', roleCode: 'INTERN', status: 'SUSPENDED', deptCode: 'WEB_DEV'
  });

  const pendingApplicantUser = await createSyntheticUser({
    uid: 'qa-uid-applicant-pending', email: 'qa.applicant.pending@intellicore.test',
    fullName: 'Applicant Zeta', roleCode: 'INTERN'
  });

  const rejectedApplicantUser = await createSyntheticUser({
    uid: 'qa-uid-applicant-rejected', email: 'qa.applicant.rejected@intellicore.test',
    fullName: 'Applicant Eta', roleCode: 'INTERN'
  });

  console.log('  ✓ 14 synthetic user identities created across all 8 roles.');

  // 4. Create Staff Profiles
  await prisma.staffProfile.upsert({
    where: { userId: teamLead.id },
    update: {},
    create: {
      userId: teamLead.id,
      staffCode: 'STAFF-TL-001',
      designation: 'Lead Web Engineer',
      joiningDate: new Date('2026-01-15T09:30:00Z'),
      employmentStatus: 'ACTIVE',
      createdBy: founder.id
    }
  });

  await prisma.staffProfile.upsert({
    where: { userId: hrManager.id },
    update: {},
    create: {
      userId: hrManager.id,
      staffCode: 'STAFF-HR-001',
      designation: 'Head of People Operations',
      joiningDate: new Date('2026-01-10T09:30:00Z'),
      employmentStatus: 'ACTIVE',
      createdBy: founder.id
    }
  });

  console.log('  ✓ Staff profiles seeded for Team Leader and HR Manager.');

  // 5. Create Applications and Internships
  // Pending Application
  await prisma.internshipApplication.upsert({
    where: { id: 'qa-app-pending-001' },
    update: {},
    create: {
      id: 'qa-app-pending-001',
      applicantUserId: pendingApplicantUser.id,
      departmentId: webDevDept.id,
      applicationStatus: 'PENDING_APPROVAL',
      requestedStartDate: new Date('2026-12-01T00:00:00Z'),
      requestedDuration: '3 months',
      qualification: 'B.Tech Computer Science',
      institution: 'State Technical University',
      course: 'B.Tech',
      specialization: 'Software Engineering',
      graduationYear: 2027,
      skills: 'JavaScript, React, Node.js, HTML/CSS',
      motivation: 'Passionate about full-stack engineering and high-reliability systems.',
      contactNumber: '+919876543210',
      submittedAt: new Date()
    }
  });

  // Rejected Application
  await prisma.internshipApplication.upsert({
    where: { id: 'qa-app-rejected-002' },
    update: {},
    create: {
      id: 'qa-app-rejected-002',
      applicantUserId: rejectedApplicantUser.id,
      departmentId: webDevDept.id,
      applicationStatus: 'REJECTED',
      requestedStartDate: new Date('2026-11-01T00:00:00Z'),
      requestedDuration: '6 months',
      qualification: 'B.Sc Information Technology',
      institution: 'City College',
      course: 'B.Sc',
      specialization: 'Information Technology',
      graduationYear: 2026,
      skills: 'Basic HTML, Python',
      motivation: 'Looking for remote experience.',
      contactNumber: '+919876543211',
      submittedAt: new Date('2026-10-20T00:00:00Z'),
      reviewedBy: hrManager.id,
      reviewedAt: new Date('2026-10-22T00:00:00Z'),
      reviewRemarks: 'Schedule conflicts with IST business hours requirements.'
    }
  });

  // Active Internship
  const activeInternship = await prisma.internship.upsert({
    where: { internshipCode: 'INT-QA-2026-101' },
    update: {},
    create: {
      internshipCode: 'INT-QA-2026-101',
      userId: activeInternUser.id,
      departmentId: webDevDept.id,
      assignedTeamLeaderId: teamLead.id,
      positionTitle: 'Full-Stack Web Development Intern',
      commencementDate: new Date('2026-10-01T00:00:00Z'),
      expectedCompletionDate: new Date('2026-12-31T00:00:00Z'),
      duration: '3 months',
      workMode: 'REMOTE',
      internshipStatus: 'ONGOING',
      approvedBy: hrManager.id,
      approvedAt: new Date('2026-09-28T00:00:00Z')
    }
  });

  // Completed Internship
  const completedInternship = await prisma.internship.upsert({
    where: { internshipCode: 'INT-QA-2026-102' },
    update: {},
    create: {
      internshipCode: 'INT-QA-2026-102',
      userId: completedInternUser.id,
      departmentId: webDevDept.id,
      assignedTeamLeaderId: teamLead.id,
      positionTitle: 'Frontend Development Intern',
      commencementDate: new Date('2026-07-01T00:00:00Z'),
      expectedCompletionDate: new Date('2026-09-30T00:00:00Z'),
      actualCompletionDate: new Date('2026-09-30T18:30:00Z'),
      duration: '3 months',
      workMode: 'REMOTE',
      internshipStatus: 'COMPLETED',
      approvedBy: hrManager.id,
      approvedAt: new Date('2026-06-25T00:00:00Z'),
      completionApprovedBy: hrManager.id,
      completionApprovedAt: new Date('2026-09-30T18:30:00Z')
    }
  });

  // Manual Certificate Email Declaration (In-app tracking only, zero outbox email)
  await prisma.certificateDispatch.upsert({
    where: { internshipId_sequence: { internshipId: completedInternship.id, sequence: 1 } },
    update: {},
    create: {
      internshipId: completedInternship.id,
      actorId: founder.id,
      requestKey: 'qa-cert-dispatch-req-001',
      sequence: 1,
      status: 'SENT',
      declaredSentAt: new Date('2026-10-01T10:00:00Z'),
      note: 'Certificate dispatched manually via external verified Google Workspace channel.'
    }
  });

  console.log('  ✓ Internship records and certificate declaration seeded.');

  // 6. Seed Attendance Policy & Records
  const policy = await prisma.attendancePolicy.upsert({
    where: { effectiveFrom: new Date('2026-01-01') },
    update: {},
    create: {
      name: 'Standard Enterprise IST Operations Hours',
      timezone: 'Asia/Kolkata',
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      checkInTime: '09:30',
      checkOutTime: '18:30',
      reportDeadline: '20:00',
      graceMinutes: 0,
      requiresDailyReport: true,
      effectiveFrom: new Date('2026-01-01')
    }
  });

  // Attendance Eligibility
  await prisma.attendanceEligibility.upsert({
    where: { id: 'qa-eligibility-001' },
    update: {},
    create: {
      id: 'qa-eligibility-001',
      internshipId: activeInternship.id,
      startsAt: new Date('2026-10-01T00:00:00Z'),
      firstDate: new Date('2026-10-01'),
      lastDate: new Date('2026-12-31')
    }
  });

  // Attendance Record for today
  const today = new Date('2026-11-25');
  await prisma.attendance.upsert({
    where: { internshipId_businessDate: { internshipId: activeInternship.id, businessDate: today } },
    update: {},
    create: {
      internshipId: activeInternship.id,
      businessDate: today,
      policyId: policy.id,
      checkInAt: new Date('2026-11-25T04:00:00Z'), // 09:30 AM IST
      checkOutAt: new Date('2026-11-25T13:00:00Z'), // 06:30 PM IST
      source: 'DASHBOARD'
    }
  });

  // 7. Seed Daily Work Report
  await prisma.dailyWorkReport.upsert({
    where: { internshipId_businessDate: { internshipId: activeInternship.id, businessDate: today } },
    update: {},
    create: {
      internshipId: activeInternship.id,
      businessDate: today,
      workCompleted: 'Implemented responsive navigation and wired auth event listeners.',
      learningSummary: 'Mastered CSS container queries and responsive design patterns.',
      progressSummary: 'Sprint milestone 2 completed ahead of schedule.',
      blockers: 'None',
      nextDayPlan: 'Complete QA end-to-end regression suites and audit logs verification.',
      status: 'REVIEWED',
      submittedAt: new Date('2026-11-25T12:45:00Z'),
      reviewedBy: teamLead.id,
      reviewedAt: new Date('2026-11-25T13:10:00Z'),
      reviewRemarks: 'Excellent quality work and clean commits.'
    }
  });

  // 8. Seed Leave Request
  await prisma.leaveRequest.upsert({
    where: { id: 'qa-leave-req-001' },
    update: {},
    create: {
      id: 'qa-leave-req-001',
      internshipId: activeInternship.id,
      leaveType: 'CASUAL_LEAVE',
      startDate: new Date('2026-12-05'),
      endDate: new Date('2026-12-06'),
      workingDays: 2,
      reason: 'Academic mid-term examinations.',
      status: 'APPROVED',
      reviewedBy: hrManager.id,
      reviewedAt: new Date('2026-11-24T15:00:00Z'),
      reviewRemarks: 'Approved for academic exams.'
    }
  });

  // 9. Seed Tasks, Submissions and Reviews
  const task = await prisma.task.upsert({
    where: { taskCode: 'TASK-QA-2026-001' },
    update: {},
    create: {
      taskCode: 'TASK-QA-2026-001',
      departmentId: webDevDept.id,
      createdBy: teamLead.id,
      title: 'Responsive Authentication Modal Optimization',
      description: 'Audit and polish sign-in modal for 360px-1920px viewports with password toggle.',
      instructions: 'Ensure full responsiveness, clear visual hierarchy, and WCAG AA contrast compliance.',
      deliverables: 'Updated CSS stylesheet and JS auth controller with unit tests.',
      resources: [{ title: 'Design Specs', url: 'https://specs.intellicore.test/auth-modal' }],
      rubric: [
        { criterion: 'UI Responsiveness', points: 40 },
        { criterion: 'Accessibility & Contrast', points: 30 },
        { criterion: 'Code Quality', points: 30 }
      ],
      taskType: 'INDIVIDUAL',
      priority: 'HIGH',
      status: 'PUBLISHED',
      availableFrom: new Date('2026-11-20T00:00:00Z'),
      dueAt: new Date('2026-11-28T18:30:00Z'),
      maximumScore: 100,
      publishedAt: new Date('2026-11-20T00:00:00Z')
    }
  });

  const assignment = await prisma.taskAssignment.upsert({
    where: { taskId_internshipId: { taskId: task.id, internshipId: activeInternship.id } },
    update: {},
    create: {
      taskId: task.id,
      internshipId: activeInternship.id,
      assignedTo: activeInternUser.id,
      assignedBy: teamLead.id,
      dueAt: new Date('2026-11-28T18:30:00Z'),
      status: 'COMPLETED'
    }
  });

  const submission = await prisma.taskSubmission.upsert({
    where: { assignmentId_submissionVersion: { assignmentId: assignment.id, submissionVersion: 1 } },
    update: {},
    create: {
      assignmentId: assignment.id,
      submittedBy: activeInternUser.id,
      submissionVersion: 1,
      writtenResponse: 'Refactored CSS styles and added password visibility toggle button with high contrast.',
      projectUrl: 'https://staging.intellicore.test/preview',
      repositoryUrl: 'https://github.com/intellicore/qa-submission',
      additionalLinks: [],
      status: 'SUBMITTED',
      submittedAt: new Date('2026-11-25T11:00:00Z')
    }
  });

  await prisma.taskReview.upsert({
    where: { submissionId: submission.id },
    update: {},
    create: {
      submissionId: submission.id,
      reviewedBy: teamLead.id,
      decision: 'APPROVED',
      score: 95,
      maximumScore: 100,
      criterionScores: [38, 29, 28],
      feedback: 'Outstanding work on responsive breakpoints and accessibility tokens.',
      reviewedAt: new Date('2026-11-25T12:00:00Z')
    }
  });

  // 10. Seed Meetings
  const meeting = await prisma.meeting.upsert({
    where: { meetingCode: 'MEET-QA-2026-001' },
    update: {},
    create: {
      meetingCode: 'MEET-QA-2026-001',
      organizerId: teamLead.id,
      departmentId: webDevDept.id,
      title: 'Weekly Web Development Engineering Sync',
      description: 'Weekly review of sprint tasks, pull requests, and learning modules.',
      audienceType: 'DEPARTMENT',
      selectedUserIds: [],
      creationMode: 'MANUAL',
      startAt: new Date('2026-11-26T10:00:00Z'),
      endAt: new Date('2026-11-26T11:00:00Z'),
      timezone: 'Asia/Kolkata',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      status: 'SCHEDULED'
    }
  });

  await prisma.meetingParticipant.upsert({
    where: { meetingId_userId: { meetingId: meeting.id, userId: teamLead.id } },
    update: {},
    create: {
      meetingId: meeting.id,
      userId: teamLead.id,
      response: 'ACCEPTED'
    }
  });

  await prisma.meetingParticipant.upsert({
    where: { meetingId_userId: { meetingId: meeting.id, userId: activeInternUser.id } },
    update: {},
    create: {
      meetingId: meeting.id,
      userId: activeInternUser.id,
      response: 'ACCEPTED'
    }
  });

  // 11. Seed Announcements & In-app Notifications
  const announcement = await prisma.announcement.upsert({
    where: { id: 'qa-announcement-001' },
    update: {},
    create: {
      id: 'qa-announcement-001',
      createdBy: founder.id,
      departmentId: null,
      title: 'IntelliCore V2.0 Enterprise Platform Update',
      message: 'All interns and staff: Welcome to the unified IntelliCore workspace platform.',
      audienceType: 'ALL_ACTIVE_USERS',
      selectedUsers: [],
      status: 'PUBLISHED',
      publishedAt: new Date()
    }
  });

  await prisma.notification.upsert({
    where: { deduplicationKey: 'qa-notif-dedup-task-review-001' },
    update: {},
    create: {
      recipientUserId: activeInternUser.id,
      eventType: 'TASK_REVIEWED',
      category: 'TASK',
      title: 'Task Review Completed',
      message: 'Your submission for "Responsive Authentication Modal Optimization" was approved with score 95/100.',
      relatedResourceType: 'TASK',
      relatedResourceId: task.id,
      actionPath: '/tasks',
      deduplicationKey: 'qa-notif-dedup-task-review-001',
      readAt: null
    }
  });

  await prisma.notification.upsert({
    where: { deduplicationKey: 'qa-notif-dedup-cert-dispatch-001' },
    update: {},
    create: {
      recipientUserId: completedInternUser.id,
      eventType: 'CERTIFICATE_DECLARED',
      category: 'INTERNSHIP',
      title: 'Internship Certificate Dispatched',
      message: 'Your internship certificate has been sent to your registered email address via external dispatch.',
      relatedResourceType: 'INTERNSHIP',
      relatedResourceId: completedInternship.id,
      actionPath: '/internships',
      deduplicationKey: 'qa-notif-dedup-cert-dispatch-001',
      readAt: new Date()
    }
  });

  // 12. Seed Immutable Audit Log
  await prisma.auditLog.create({
    data: {
      action: 'QA_ENVIRONMENT_SEEDED',
      actorUserId: founder.id,
      resourceType: 'DATABASE',
      resourceId: 'intellicore_qa_db',
      sanitizedAfter: JSON.stringify({ status: 'SEEDED', rolesCount: 8, usersCount: 14 })
    }
  });

  console.log('✅ QA fixtures seeded completely and successfully into intellicore_qa_db!');
}

seedQa()
  .catch(err => {
    console.error('❌ Seeding QA fixtures failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
