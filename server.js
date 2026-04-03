async function downloadVideo(url, quality) {
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Getting download links...';
    btn.disabled = true;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/download?url=${encodeURIComponent(url)}&quality=${quality}`);
        const data = await response.json();
        
        console.log('Download data:', data);
        
        if (data.success === true && data.downloadServices && data.downloadServices.length > 0) {
            // Create a selection message
            let message = 'Select a download service:\n\n';
            data.downloadServices.forEach((service, index) => {
                message += `${index + 1}. ${service.name}\n`;
            });
            message += '\nEnter number (1-' + data.downloadServices.length + '):';
            
            const choice = prompt(message, '1');
            const selectedIndex = parseInt(choice) - 1;
            
            if (selectedIndex >= 0 && selectedIndex < data.downloadServices.length) {
                const selectedService = data.downloadServices[selectedIndex];
                window.open(selectedService.url, '_blank');
                alert(`✅ ${selectedService.name} opened!\n\n${selectedService.instructions}`);
            } else {
                alert('Invalid choice. Please try again.');
            }
        }
        else if (data.downloadOptions && data.downloadOptions.length > 0) {
            // Fallback for old format
            window.open(data.downloadOptions[0], '_blank');
            alert('✅ Download page opened! Look for the download button.');
        }
        else if (data.directVideo) {
            window.open(data.directVideo, '_blank');
            alert('💡 Video opened. Right-click and select "Save video as..."');
        }
        else {
            alert('No download links available. Try again later.');
        }
        
    } catch (error) {
        console.error('Download error:', error);
        alert('Error: ' + error.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
