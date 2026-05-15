import datetime
import statistics


def _projected_date_from_gap(target_date, weekly_target, gap_vs_target):
    if weekly_target <= 0:
        return target_date
    delta_weeks = float(gap_vs_target) / float(weekly_target)
    return target_date - datetime.timedelta(days=round(delta_weeks * 7))


def _trajectory_status(gap_vs_target, weekly_target):
    if abs(float(gap_vs_target)) < 5:
        return "Approximately on track"
    if gap_vs_target >= weekly_target * 0.10:
        return "Ahead"
    if gap_vs_target >= weekly_target * -0.40:
        return "On track"
    return "Behind"


def _projection_confidence(category_deltas, active_simulation):
    values = [abs(float(row.get("Estimated savings", 0.0))) for row in category_deltas or []]
    sustained_weeks = 1 if active_simulation and active_simulation != "none" else 0
    if len(values) < 3 or sustained_weeks == 0:
        return "Low confidence"
    avg = statistics.mean(values)
    volatility = statistics.pstdev(values) if len(values) > 1 else 0.0
    if avg <= 0:
        return "Low confidence"
    ratio = volatility / avg
    if sustained_weeks >= 3 and ratio < 0.45:
        return "High confidence"
    if ratio < 0.9:
        return "Medium confidence"
    return "Low confidence"


def calculateGoalTrajectory(
    *,
    active_simulation,
    baseline_weekly_flexible_spend,
    current_week_flexible_spend,
    added_to_goal_this_week,
    goal_cost,
    goal_progress,
    target_date,
    today,
    category_deltas,
    recommended_actions,
    number_of_simulation_transactions,
):
    behavior_improvement = float(baseline_weekly_flexible_spend) - float(current_week_flexible_spend)
    detected_savings = behavior_improvement
    remaining = max(0.0, float(goal_cost) - max(0.0, float(goal_progress)))
    weeks_until_target = max(1.0, (target_date - today).days / 7.0)
    weekly_target = remaining / weeks_until_target
    gap_vs_target = behavior_improvement - weekly_target
    actual_goal_gap_vs_target = max(0.0, float(added_to_goal_this_week)) - weekly_target
    projected_date = _projected_date_from_gap(target_date, weekly_target, gap_vs_target)
    actual_goal_projected_date = _projected_date_from_gap(target_date, weekly_target, actual_goal_gap_vs_target)
    trajectory_status = _trajectory_status(gap_vs_target, weekly_target)

    return {
        "active_simulation": active_simulation,
        "baselineWeeklyFlexibleSpend": float(baseline_weekly_flexible_spend),
        "currentWeekFlexibleSpend": float(current_week_flexible_spend),
        "behaviorImprovement": behavior_improvement,
        "detectedSavings": detected_savings,
        "addedToGoalThisWeek": max(0.0, float(added_to_goal_this_week)),
        "weeklyTarget": weekly_target,
        "gapVsTarget": gap_vs_target,
        "actualGoalGapVsTarget": actual_goal_gap_vs_target,
        "remaining": remaining,
        "projectedDate": projected_date,
        "actualGoalProjectedDate": actual_goal_projected_date,
        "trajectoryStatus": trajectory_status,
        "categoryDeltas": list(category_deltas or []),
        "recommendedActions": list(recommended_actions or []),
        "simulationSummary": {
            "active_simulation": active_simulation,
            "number_of_simulation_transactions": int(number_of_simulation_transactions or 0),
            "projection_confidence": _projection_confidence(category_deltas, active_simulation),
        },
    }
