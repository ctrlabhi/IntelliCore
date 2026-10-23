"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { tracks, taskById } = require("./curriculum");

test("curriculum covers all eight published internship tracks", () => {
  assert.deepEqual(Object.keys(tracks), [
    "Business Analyst Intern",
    "Web Development Intern",
    "Data Analyst Intern",
    "Digital Marketing Intern",
    "Graphic Designer Intern",
    "Social Media Intern",
    "Content Writing Intern",
    "Human Resources Intern"
  ]);
});

test("each starter task has instructions, a deliverable, and a 100-point rubric", () => {
  for (const [track, tasks] of Object.entries(tracks)) {
    assert.ok(tasks.length >= 2, `${track} needs more than one task`);
    for (const task of tasks) {
      assert.ok(task.id);
      assert.ok(task.title);
      assert.ok(task.instructions.length > 100);
      assert.ok(task.deliverable.length > 20);
      assert.equal(task.rubric.reduce((sum, row) => sum + row.points, 0), 100);
      assert.equal(taskById.get(task.id).track, track);
    }
  }
});
