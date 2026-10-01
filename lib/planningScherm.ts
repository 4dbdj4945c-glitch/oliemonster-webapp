// Wat het planningsscherm (PlanningPaneel) in één keer krijgt: de dagen, de
// objecten met wat er nog open staat, en de taken en inspecties die nog op een
// dag kunnen. GET /api/sample-plans geeft dit, en elke wijziging aan de
// planning geeft het in het antwoord mee (`planning`), zodat het scherm na een
// wijziging niet alles nog eens hoeft op te halen.

import { haalPlanning } from './samplePlans';
import { haalTePlannen } from './contractenServer';

export async function haalPlanningScherm(analysisYear: number) {
  const [planning, tePlannen] = await Promise.all([haalPlanning(analysisYear), haalTePlannen()]);
  return { ...planning, tePlannen };
}

