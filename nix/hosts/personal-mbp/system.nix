{ ... }:
{
  system.defaults.finder = {
    AppleShowAllFiles = true;
    AppleShowAllExtensions = true;
    _FXShowPosixPathInTitle = true;
    ShowPathbar = true;
    ShowStatusBar = true;
  };

  system.defaults.NSGlobalDomain = {
    AppleICUForce24HourTime = true;
    AppleInterfaceStyle = "Dark";
    NSAutomaticSpellingCorrectionEnabled = false;
    NSAutomaticCapitalizationEnabled = false;
    NSAutomaticPeriodSubstitutionEnabled = false;
    NSAutomaticWindowAnimationsEnabled = false;
  };

  system.defaults.dock = {
    autohide = false;
    orientation = "left";
    tilesize = 48;

    # disable hot corner - bottom right
    wvous-br-corner = 1
  };
}
