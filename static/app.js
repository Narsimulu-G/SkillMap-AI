document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const searchForm = document.getElementById("searchForm");
    const skillInput = document.getElementById("skillInput");
    const locationInput = document.getElementById("locationInput");
    const submitBtn = document.getElementById("submitBtn");

    const insightsContainer = document.getElementById("insightsContainer");
    const insightsSkeleton = document.getElementById("insightsSkeleton");
    
    const jobsContainer = document.getElementById("jobsContainer");
    const jobsSkeleton = document.getElementById("jobsSkeleton");
    const jobCountBadge = document.getElementById("jobCountBadge");

    const settingsBtn = document.getElementById("settingsBtn");
    const settingsModal = document.getElementById("settingsModal");
    const closeSettingsBtn = document.getElementById("closeSettingsBtn");
    const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
    const keysForm = document.getElementById("keysForm");

    const geminiKeyInput = document.getElementById("geminiKeyInput");
    const tavilyKeyInput = document.getElementById("tavilyKeyInput");
    const rapidapiKeyInput = document.getElementById("rapidapiKeyInput");
    const geminiDetectedBadge = document.getElementById("geminiDetectedBadge");

    const apiStatusBanner = document.getElementById("apiStatusBanner");
    const bannerConfigBtn = document.getElementById("bannerConfigBtn");

    // Modal behavior
    const openModal = () => {
        settingsModal.classList.remove("hidden");
        // Reload keys statuses
        checkKeysStatus();
    };

    const closeModal = () => {
        settingsModal.classList.add("hidden");
    };

    settingsBtn.addEventListener("click", openModal);
    bannerConfigBtn.addEventListener("click", openModal);
    closeSettingsBtn.addEventListener("click", closeModal);
    cancelSettingsBtn.addEventListener("click", closeModal);
    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) closeModal();
    });

    // Check API Keys Status on Load
    const checkKeysStatus = async () => {
        try {
            const res = await fetch("/api/get-keys");
            const data = await res.json();
            
            // Show status in settings form
            if (data.gemini) {
                geminiKeyInput.placeholder = "Gemini Key configured (type to replace)";
            } else if (data.gemini_key_detected) {
                geminiKeyInput.placeholder = "Sibling key detected (prefilled automatically)";
                geminiDetectedBadge.classList.remove("hidden");
            } else {
                geminiKeyInput.placeholder = "Enter Gemini API Key";
                geminiDetectedBadge.classList.add("hidden");
            }

            if (data.tavily) {
                tavilyKeyInput.placeholder = "Tavily Key configured (type to replace)";
            } else {
                tavilyKeyInput.placeholder = "Enter Tavily API Key";
            }

            if (data.rapidapi) {
                rapidapiKeyInput.placeholder = "RapidAPI Key configured (type to replace)";
            } else {
                rapidapiKeyInput.placeholder = "Enter RapidAPI Key";
            }

            // Show status banner if any keys are missing
            if (!data.gemini || !data.tavily || !data.rapidapi) {
                apiStatusBanner.classList.remove("hidden");
            } else {
                apiStatusBanner.classList.add("hidden");
            }
        } catch (err) {
            console.error("Failed to check keys status:", err);
        }
    };

    // Save Keys
    keysForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById("saveKeysBtn");
        const originalText = saveBtn.innerHTML;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        saveBtn.disabled = true;

        const gemini_key = geminiKeyInput.value.trim();
        const tavily_key = tavilyKeyInput.value.trim();
        const rapidapi_key = rapidapiKeyInput.value.trim();

        try {
            const res = await fetch("/api/save-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gemini_key, tavily_key, rapidapi_key })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Failed to save keys.");
            }

            // Clear inputs
            geminiKeyInput.value = "";
            tavilyKeyInput.value = "";
            rapidapiKeyInput.value = "";

            alert("API Configuration updated successfully!");
            closeModal();
            checkKeysStatus();
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
        }
    });

    // Simple Custom Markdown Formatter
    const parseMarkdown = (text) => {
        if (!text) return "";
        let html = text;

        if (typeof html !== "string") {
            if (Array.isArray(html)) {
                html = html.map(block => {
                    if (typeof block === "string") return block;
                    if (block && typeof block === "object") {
                        if (block.text) return block.text;
                        return JSON.stringify(block);
                    }
                    return String(block);
                }).join("\n");
            } else if (typeof html === "object") {
                html = html.text || JSON.stringify(html);
            } else {
                html = String(html);
            }
        }

        // Clean double asterisks for bold
        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

        // Format headers: ### -> h4, ## -> h3, # -> h2
        html = html.replace(/^### (.*?)$/gm, "<h4>$1</h4>");
        html = html.replace(/^## (.*?)$/gm, "<h3>$1</h3>");
        html = html.replace(/^# (.*?)$/gm, "<h2>$1</h2>");

        // Format bullet lists: lines starting with - or *
        // First wrap lists in <ul> tags
        const lines = html.split("\n");
        let inList = false;
        const formattedLines = [];

        for (let line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                const liContent = trimmed.substring(2);
                if (!inList) {
                    formattedLines.push("<ul>");
                    inList = true;
                }
                formattedLines.push(`<li>${liContent}</li>`);
            } else {
                if (inList) {
                    formattedLines.push("</ul>");
                    inList = false;
                }
                formattedLines.push(line);
            }
        }
        if (inList) {
            formattedLines.push("</ul>");
        }
        html = formattedLines.join("\n");

        // Convert double newlines into paragraphs
        html = html.replace(/\n\n/g, "</p><p>");
        // Wrap final output in a paragraph if not already inside list or header tags
        html = `<div class="agent-insights-text"><p>${html}</p></div>`;
        
        // Remove empty paragraphs
        html = html.replace(/<p><\/p>/g, "");
        html = html.replace(/<p>\s*<\/p>/g, "");
        return html;
    };

    // Render Job Cards
    const renderJobs = (jobs) => {
        jobsContainer.innerHTML = "";

        if (!jobs || jobs.length === 0) {
            jobCountBadge.textContent = "0 found";
            jobsContainer.innerHTML = `
                <div class="empty-state-content">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <h3>No Job Openings Found</h3>
                    <p>The job search query returned no active opportunities. Double-check your spelling or broaden your location filter.</p>
                </div>
            `;
            return;
        }

        // Filter out items that contain errors
        const validJobs = jobs.filter(j => !j.error);
        
        if (validJobs.length === 0) {
            jobCountBadge.textContent = "0 found";
            const errMsg = jobs[0].error || "Failed to retrieve matching jobs.";
            jobsContainer.innerHTML = `
                <div class="empty-state-content">
                    <i class="fa-solid fa-triangle-exclamation text-danger"></i>
                    <h3>Job Fetch Interrupted</h3>
                    <p class="text-danger">${errMsg}</p>
                </div>
            `;
            return;
        }

        jobCountBadge.textContent = `${validJobs.length} found`;
        
        const listDiv = document.createElement("div");
        listDiv.className = "jobs-list";

        validJobs.forEach((job) => {
            const card = document.createElement("div");
            card.className = "job-card";

            // Experience rendering
            const expText = job.job_required_experience 
                ? `${Math.round(job.job_required_experience / 12)} yrs exp` 
                : "Experience unspecified";

            // Salary rendering
            let salaryText = "Salary unspecified";
            if (job.job_min_salary && job.job_max_salary) {
                salaryText = `${job.job_salary_currency || "$"} ${job.job_min_salary.toLocaleString()} - ${job.job_max_salary.toLocaleString()}`;
            } else if (job.job_min_salary) {
                salaryText = `Min: ${job.job_salary_currency || "$"} ${job.job_min_salary.toLocaleString()}`;
            }

            card.innerHTML = `
                <div class="job-card-header">
                    <div class="job-title-wrapper">
                        <h4 class="job-title">${job.job_title}</h4>
                        <span class="job-company">${job.employer_name}</span>
                    </div>
                    <span class="job-publisher-tag">${job.job_publisher || "JSearch"}</span>
                </div>
                
                <div class="job-details-meta">
                    <span class="meta-pill"><i class="fa-solid fa-location-dot"></i> ${job.job_location || "Remote/Flexible"}</span>
                    <span class="meta-pill"><i class="fa-solid fa-briefcase"></i> ${job.job_employment_type || "Full Time"}</span>
                    <span class="meta-pill"><i class="fa-solid fa-clock"></i> ${expText}</span>
                    <span class="meta-pill"><i class="fa-solid fa-hand-holding-dollar"></i> ${salaryText}</span>
                </div>

                <p class="job-description">${job.job_description || "No description provided."}</p>
                <button class="btn-toggle-desc">Read More</button>

                <div class="job-card-footer">
                    <a href="${job.job_apply_link}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-apply">
                        <i class="fa-solid fa-external-link"></i> Apply Now
                    </a>
                </div>
            `;

            // Toggle Expand Description
            const toggleBtn = card.querySelector(".btn-toggle-desc");
            const descPara = card.querySelector(".job-description");
            toggleBtn.addEventListener("click", () => {
                if (descPara.classList.contains("expanded")) {
                    descPara.classList.remove("expanded");
                    toggleBtn.textContent = "Read More";
                } else {
                    descPara.classList.add("expanded");
                    toggleBtn.textContent = "Show Less";
                }
            });

            listDiv.appendChild(card);
        });

        jobsContainer.appendChild(listDiv);
    };

    // Form submission (Skill & Location Search)
    searchForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        // Clear layout state
        insightsContainer.innerHTML = "";
        insightsContainer.classList.add("hidden");
        jobsContainer.innerHTML = "";
        jobsContainer.classList.add("hidden");
        jobCountBadge.textContent = "Searching...";

        // Show loading skeletons
        insightsSkeleton.classList.remove("hidden");
        jobsSkeleton.classList.remove("hidden");

        // Disable form inputs
        skillInput.disabled = true;
        locationInput.disabled = true;
        submitBtn.disabled = true;
        const originalBtnHTML = submitBtn.innerHTML;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';

        const skill = skillInput.value.trim();
        const location = locationInput.value.trim();

        try {
            const res = await fetch("/api/analyze-skill", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ skill, location })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.detail || "Server error occurred while executing the agent.");
            }

            const data = await res.json();

            // Render Insights
            insightsContainer.innerHTML = parseMarkdown(data.insights);
            insightsContainer.classList.remove("empty-state", "hidden");
            
            // Render Jobs
            renderJobs(data.jobs);
            jobsContainer.classList.remove("empty-state", "hidden");

        } catch (err) {
            console.error(err);
            insightsContainer.innerHTML = `
                <div class="empty-state-content text-danger">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <h3>Agent Execution Failed</h3>
                    <p>${err.message}</p>
                </div>
            `;
            insightsContainer.classList.remove("hidden");
            
            jobsContainer.innerHTML = `
                <div class="empty-state-content text-danger">
                    <i class="fa-solid fa-list-check"></i>
                    <h3>No Job Openings Available</h3>
                    <p>Job search process aborted because the agent encountered an error.</p>
                </div>
            `;
            jobsContainer.classList.remove("hidden");
            jobCountBadge.textContent = "0 found";

            // If API keys error, open modal automatically
            if (err.message.includes("API Key") || err.message.includes("not configured")) {
                openModal();
            }
        } finally {
            // Hide loading skeletons
            insightsSkeleton.classList.add("hidden");
            jobsSkeleton.classList.add("hidden");

            // Re-enable form inputs
            skillInput.disabled = false;
            locationInput.disabled = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
        }
    });

    // Check keys status on load
    checkKeysStatus();
});
