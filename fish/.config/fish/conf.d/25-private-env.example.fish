# Copy to `25-private-env.fish` and remove the `if false` block to set private environment variables.

if false
    # set multiple variables to the same value.
    for env in GITHUB_TOKEN NPM_AUTH_TOKEN
        set -x $env "your-token"
    end
end