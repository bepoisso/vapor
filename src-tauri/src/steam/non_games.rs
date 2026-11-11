//! Installed apps that are not games (runtimes, tools, software). App manifests don't say what
//! an app is, and Vapor reads text files only (see DECISIONS.md), so these are listed by hand
//! until the Store API provides the app type (Phase 4).

use crate::model::AppId;

const NON_GAME_APP_IDS: &[AppId] = &[
    1007,      // Steamworks SDK Redist
    228_980,   // Steamworks Common Redistributables
    250_820,   // SteamVR
    431_960,   // Wallpaper Engine
    1_070_560, // Steam Linux Runtime 1.0 (scout)
    1_391_110, // Steam Linux Runtime 2.0 (soldier)
    1_628_350, // Steam Linux Runtime 3.0 (sniper)
    1_161_040, // Proton BattlEye Runtime
    1_826_330, // Proton EasyAntiCheat Runtime
    1_493_710, // Proton Experimental
    1_887_720, // Proton 7.0
    2_348_590, // Proton 8.0
    2_805_730, // Proton 9.0
];

pub fn is_non_game(app_id: AppId, name: &str) -> bool {
    NON_GAME_APP_IDS.contains(&app_id)
        || name.starts_with("Proton ")
        || name.starts_with("Steam Linux Runtime")
        || name.contains("Redistributable")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_runtimes_and_tools_but_not_games() {
        assert!(is_non_game(228_980, "Steamworks Common Redistributables"));
        assert!(is_non_game(250_820, "SteamVR"));
        assert!(is_non_game(3_658_110, "Proton 10.0"));
        assert!(!is_non_game(504_230, "Celeste"));
        assert!(!is_non_game(450_390, "The Lab"));
    }
}
