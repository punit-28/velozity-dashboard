import { PrismaClient, TaskStatus, TaskPriority } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Password123!';

function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log('Seeding database...');

  // Clean slate (order matters for FKs).
  await prisma.notification.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.taskStatusEvent.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.create({
    data: { name: 'Amara Singh', email: 'admin@velozity.dev', passwordHash, role: 'ADMIN' },
  });

  const pm1 = await prisma.user.create({
    data: { name: 'Farhan Ali', email: 'pm1@velozity.dev', passwordHash, role: 'PM' },
  });
  const pm2 = await prisma.user.create({
    data: { name: 'Sofia Torres', email: 'pm2@velozity.dev', passwordHash, role: 'PM' },
  });

  const dev1 = await prisma.user.create({
    data: { name: 'Ravi Kumar', email: 'dev1@velozity.dev', passwordHash, role: 'DEVELOPER' },
  });
  const dev2 = await prisma.user.create({
    data: { name: 'Elena Petrova', email: 'dev2@velozity.dev', passwordHash, role: 'DEVELOPER' },
  });
  const dev3 = await prisma.user.create({
    data: { name: 'Marcus Chen', email: 'dev3@velozity.dev', passwordHash, role: 'DEVELOPER' },
  });
  const dev4 = await prisma.user.create({
    data: { name: 'Priya Nair', email: 'dev4@velozity.dev', passwordHash, role: 'DEVELOPER' },
  });

  const clientA = await prisma.client.create({ data: { name: 'Brightline Retail', email: 'contact@brightline.example' } });
  const clientB = await prisma.client.create({ data: { name: 'Northwind Logistics', email: 'ops@northwind.example' } });
  const clientC = await prisma.client.create({ data: { name: 'Alto Health Systems', email: 'it@altohealth.example' } });

  const projectA = await prisma.project.create({
    data: { name: 'Brightline E-commerce Revamp', description: 'Full storefront redesign and checkout overhaul.', clientId: clientA.id, managerId: pm1.id },
  });
  const projectB = await prisma.project.create({
    data: { name: 'Northwind Fleet Tracker', description: 'Real-time fleet tracking dashboard.', clientId: clientB.id, managerId: pm1.id },
  });
  const projectC = await prisma.project.create({
    data: { name: 'Alto Patient Portal', description: 'Patient-facing scheduling and records portal.', clientId: clientC.id, managerId: pm2.id },
  });

  type TaskSeed = {
    title: string;
    description: string;
    assigneeId: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate: Date;
  };

  const tasksA: TaskSeed[] = [
    { title: 'Implement checkout flow', description: 'Multi-step checkout with saved cards.', assigneeId: dev1.id, status: 'IN_PROGRESS', priority: 'HIGH', dueDate: daysFromNow(5) },
    { title: 'Product image CDN migration', description: 'Move product images to CDN with responsive sizes.', assigneeId: dev2.id, status: 'TODO', priority: 'MEDIUM', dueDate: daysFromNow(10) },
    { title: 'Fix cart total rounding bug', description: 'Totals off by a cent on discounted bundles.', assigneeId: dev1.id, status: 'IN_REVIEW', priority: 'CRITICAL', dueDate: daysFromNow(2) },
    { title: 'Storefront homepage redesign', description: 'New hero section and category grid.', assigneeId: dev2.id, status: 'DONE', priority: 'MEDIUM', dueDate: daysFromNow(-3) },
    { title: 'Add abandoned cart emails', description: 'Trigger email 1 hour after cart abandonment.', assigneeId: dev1.id, status: 'TODO', priority: 'LOW', dueDate: daysFromNow(-2) }, // overdue candidate
  ];

  const tasksB: TaskSeed[] = [
    { title: 'Live GPS marker clustering', description: 'Cluster markers when zoomed out on the fleet map.', assigneeId: dev3.id, status: 'IN_PROGRESS', priority: 'HIGH', dueDate: daysFromNow(4) },
    { title: 'Driver shift scheduling UI', description: 'Weekly calendar view for dispatchers.', assigneeId: dev4.id, status: 'TODO', priority: 'MEDIUM', dueDate: daysFromNow(9) },
    { title: 'WebSocket reconnect handling', description: 'Handle flaky driver-device connections gracefully.', assigneeId: dev3.id, status: 'IN_REVIEW', priority: 'HIGH', dueDate: daysFromNow(1) },
    { title: 'Route deviation alerts', description: 'Alert dispatcher when a truck deviates from planned route.', assigneeId: dev4.id, status: 'DONE', priority: 'CRITICAL', dueDate: daysFromNow(-5) },
    { title: 'Fuel usage report export', description: 'CSV export of weekly fuel usage per vehicle.', assigneeId: dev3.id, status: 'TODO', priority: 'LOW', dueDate: daysFromNow(-1) }, // overdue candidate
  ];

  const tasksC: TaskSeed[] = [
    { title: 'Appointment booking calendar', description: 'Patient-facing calendar with provider availability.', assigneeId: dev2.id, status: 'IN_PROGRESS', priority: 'CRITICAL', dueDate: daysFromNow(6) },
    { title: 'HIPAA audit log review', description: 'Confirm all PHI access is logged correctly.', assigneeId: dev4.id, status: 'TODO', priority: 'CRITICAL', dueDate: daysFromNow(3) },
    { title: 'Insurance card upload', description: 'Allow patients to upload insurance card photos.', assigneeId: dev2.id, status: 'IN_REVIEW', priority: 'MEDIUM', dueDate: daysFromNow(8) },
    { title: 'Provider messaging inbox', description: 'Secure messaging thread between patient and provider.', assigneeId: dev4.id, status: 'DONE', priority: 'HIGH', dueDate: daysFromNow(-1) },
    { title: 'Accessibility pass (WCAG AA)', description: 'Full portal accessibility audit and fixes.', assigneeId: dev2.id, status: 'TODO', priority: 'MEDIUM', dueDate: daysFromNow(14) },
  ];

  const projectSeeds: [typeof projectA, TaskSeed[], typeof pm1][] = [
    [projectA, tasksA, pm1],
    [projectB, tasksB, pm1],
    [projectC, tasksC, pm2],
  ];

  let activityCount = 0;

  for (const [project, tasks] of projectSeeds) {
    for (const t of tasks) {
      const isPastDue = t.dueDate.getTime() < Date.now();
      const task = await prisma.task.create({
        data: {
          projectId: project.id,
          title: t.title,
          description: t.description,
          assigneeId: t.assigneeId,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          isOverdue: isPastDue && t.status !== 'DONE',
        },
      });

      // Seed a creation event +, for non-TODO tasks, a transition event so
      // the activity log/feed isn't empty on first load.
      await prisma.taskStatusEvent.create({
        data: { taskId: task.id, fromStatus: null, toStatus: 'TODO', changedById: project.managerId },
      });
      await prisma.activityEvent.create({
        data: {
          projectId: project.id,
          taskId: task.id,
          actorId: project.managerId,
          message: `Task "${task.title}" was created`,
          metadata: { toStatus: 'TODO' },
        },
      });
      activityCount++;

      if (t.status !== 'TODO') {
        await prisma.taskStatusEvent.create({
          data: { taskId: task.id, fromStatus: 'TODO', toStatus: t.status, changedById: t.assigneeId },
        });
        const assignee = [dev1, dev2, dev3, dev4].find((d) => d.id === t.assigneeId)!;
        await prisma.activityEvent.create({
          data: {
            projectId: project.id,
            taskId: task.id,
            actorId: t.assigneeId,
            message: `${assignee.name} moved "${task.title}" from To Do \u2192 ${t.status.replace('_', ' ')}`,
            metadata: { fromStatus: 'TODO', toStatus: t.status },
          },
        });
        activityCount++;
      }

      // Assignment notification for every task.
      await prisma.notification.create({
        data: {
          userId: t.assigneeId,
          type: 'TASK_ASSIGNED',
          message: `You were assigned to "${task.title}"`,
          taskId: task.id,
        },
      });

      if (t.status === 'IN_REVIEW') {
        await prisma.notification.create({
          data: {
            userId: project.managerId,
            type: 'TASK_MOVED_TO_REVIEW',
            message: `"${task.title}" was moved to In Review`,
            taskId: task.id,
          },
        });
      }
    }
  }

  const overdueCount = await prisma.task.count({ where: { isOverdue: true } });

  console.log('Seed complete.');
  console.log(`  Users: 1 admin, 2 PMs, 4 developers (password for all: ${PASSWORD})`);
  console.log(`  Projects: 3, Tasks: ${tasksA.length + tasksB.length + tasksC.length}`);
  console.log(`  Overdue tasks: ${overdueCount}`);
  console.log(`  Activity events: ${activityCount}`);
  console.log('\nLogin as:');
  console.log(`  Admin      admin@velozity.dev / ${PASSWORD}`);
  console.log(`  PM         pm1@velozity.dev / ${PASSWORD}`);
  console.log(`  Developer  dev1@velozity.dev / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
